import { createModule, mutation, action } from "vuex-class-component";
import {
  ProposedConvertTransaction,
  TradingModule,
  ViewToken,
  BaseToken,
  ProposedFromTransaction,
  ProposedToTransaction,
  ViewAmount,
  ModuleParam
} from "@/types/bancor";
import { vxm } from "@/store";
import {
  get_bancor_output,
  get_settings,
  get_connector,
  get_volume,
  get_rate,
  get_inverse_rate,
  Tokens,
  Settings,
  get_tokens,
  Token,
  Volume,
  Connector,
  get_slippage,
  get_fee,
  get_spot_price
} from "@/api/telosd";
import { rpc } from "@/api/rpc";
import {
  asset_to_number,
  number_to_asset,
  symbol,
  Sym,
  Asset,
  extended_asset,
  asset,
  name
} from "eos-common";
import {
  compareString,
  retryPromise,
  findOrThrow,
  getSxContracts,
  buildTokenId
} from "@/api/helpers";
import _ from "lodash";
import wait from "waait";

interface RateDetail {
  rate: Asset;
  slippage: number;
  fee: Asset;
}

const getRate = (
  asset: Asset,
  sym: Sym,
  tokens: Tokens,
  settings: Settings
): RateDetail => {
  const rate = get_rate(asset, sym.code(), tokens, settings);
  const slippage = get_slippage(asset, sym.code(), tokens, settings);
  const fee = get_fee(asset, settings);

  return { rate, slippage, fee };
};

const getInverseRate = (
  asset: Asset,
  sym: Sym,
  tokens: Tokens,
  settings: Settings
): RateDetail => {
  const rate = get_inverse_rate(asset, sym.code(), tokens, settings);
  const slippage = get_slippage(rate, sym.code(), tokens, settings);
  const fee = get_fee(rate, settings);

  return { rate, slippage, fee };
};

const shortAssetString = (asset: Asset): string =>
  `${asset_to_number(asset)} ${asset.symbol.code().to_string()}`;

interface SxToken {
  id: string;
  symbol: string;
  precision: number;
  contract: string;
  volume24h: number;
  price: number;
  liqDepth: number;
}

const addNumbers = (acc: number, num: number) => acc + num;

//const accumulateLiq = (acc: SxToken, token: SxToken) => ({
//  ...acc,
//  liqDepth: acc.liqDepth + token.liqDepth
//});

//const accumulateVolume = (acc: SxToken, token: SxToken) => ({
//  ...acc,
//  volume24h: acc.volume24h + token.volume24h
//});

const tokensToArray = (tokens: Tokens): Token[] =>
  Object.keys(tokens).map(key => tokens[key]);

const environmentCanBeTrusted = () => {
  const baseString = "eosio.token";
  const testAsset = extended_asset(asset("1.0000 TLOS"), name(baseString));
  return baseString == testAsset.contract.to_string();
};
const trusted = environmentCanBeTrusted();

const contractDb: BaseToken[] = [
  { contract: "eosio.token", symbol: "TLOS" },
  { contract: "tokens.swaps", symbol: "TLOSD" },
  { contract: "tokens.swaps", symbol: "TLOSM" },
  { contract: "tokens.swaps", symbol: "USDT" },
  { contract: "tokens.swaps", symbol: "EOSDT" },
  { contract: "tokens.swaps", symbol: "VIGOR" }
];

const symbolNameToContract = (symbolName: string) =>
  findOrThrow(
    contractDb,
    token => compareString(token.symbol, symbolName),
    "failed to find hardcoded contract"
  ).contract;

const tokenToId = (token: Token) => {
  const symbolName = token.sym.code().to_string();
  return buildTokenId({
    contract: trusted
      ? token.contract.to_string()
      : symbolNameToContract(symbolName),
    symbol: symbolName
  });
};

/*
const connector = {
  contract: "tlosdx.swaps",
  smartToken: {
    contract: "relays.swaps",
    symbol: "8,TLOSDX"
  },
  reserves: [
    {
      contract: "tokens.swaps",
      symbol: "4,TLOSD"
    },
    {
      contract: "eosio.token",
      symbol: "4,TLOS"
    }
  ]
};
*/

interface AddedVolume extends Token {
  volume24h?: number;
}

const contract = process.env.VUE_APP_USDSTABLE!;

interface Stat {
  tokens: Tokens;
  volume: Volume[];
  settings: Settings;
  contract: string;
//  connector: Connector;
}

interface MiniRelay {
  id: string;
  tokenIds: string[];
}

interface TradeProposal {
  fromId: string;
  toId: string;
  amount: Asset;
  calculator: (token: Token, setting: Settings) => Asset;
}

interface PoolReturn {
  id: string;
  amount: RateDetail;
}

const VuexModule = createModule({
  strict: false
});

export class UsdBancorModule
  extends VuexModule.With({ namespaced: "usdsBancor/" })
  implements TradingModule {
  newTokens: SxToken[] = [];
  initiated: boolean = false;
  contracts: string[] = [];
  stats: Stat[] = [];
  lastLoaded: number = 0;

  connector: Connector = {
    tlos_liquidity_depth: 50.0,
    tlosd_liquidity_depth: 1.0,
    price: 0.02,
    volume_24h: 0.0
  };

  get wallet() {
    return "tlos";
  }

  get moreTokensAvailable() {
    return false;
  }

  get loadingTokens() {
    return !this.initiated;
  }

  get convertibleTokens() {
    return this.tokens.map(token => ({ ...token, img: token.logo }));
  }

  @action async loadMoreTokens() {}
  @action async accountChange() {}

  get tokens(): ViewToken[] {
    if (!this.initiated) {
      return [];
    }
    return this.newTokens
      .map(token => {
        let name, logo: string;
        const { contract, symbol } = token;

        try {
          const eosModuleBorrowed = vxm.tlosBancor.tokenMeta.find(
            tokenMeta => tokenMeta.symbol == token.symbol
          )!;

          if (!eosModuleBorrowed) throw new Error("Failed to find token");
          name = eosModuleBorrowed.name;
          logo = eosModuleBorrowed.logo;
        } catch (e) {
          console.warn("Failed to find name", token.symbol);
          name = token.symbol;
          logo =
            "https://raw.githubusercontent.com/Telos-Swaps/Seeds-swaps-UI-prototype/master/tokens/icons/placeholder.jpg";
        }

        const baseToken: BaseToken = {
          contract,
          symbol
        };
        const tokenBalance = vxm.tlosNetwork.balance(baseToken);

        return {
          ...token,
          id: buildTokenId(baseToken),
          name,
          logo,
          balance: tokenBalance && tokenBalance.balance
        };
      })
      .sort((a, b) => b.liqDepth - a.liqDepth);
  }

  get token() {
    return (arg0: string) => {
      return findOrThrow(
        this.tokens,
        token => compareString(token.id, arg0),
        `getter: token ${arg0}`
      );
    };
  }

  @mutation setContracts(contracts: string[]) {
    this.contracts = contracts;
  }

  @mutation moduleInitiated() {
    this.initiated = true;
  }

  @action async fetchContract(contract: string): Promise<Stat> {
    const [tokens, volume, settings] = await Promise.all([
      retryPromise(() => get_tokens(rpc, contract), 4, 500),
      retryPromise(() => get_volume(rpc, contract, 1), 4, 500),
      retryPromise(() => get_settings(rpc, contract), 4, 500)
    ]);

    return { tokens, volume, settings, contract };
  }

  @action async checkPrices(contracts: string[]) {
//    console.log(contracts);

    const prices = await Promise.all(
      contracts.map(async contract => {
        const res = await rpc.get_table_rows({
          code: contract,
          table: "spotprices",
          scope: contract
        });

        const data = res.rows[0];
        return {
          contract,
          ...data
        };
      })
    );

//    console.log("usdsPrices", prices);
  }

  @action async refresh() {
    console.log("refresh called on sx, trying new stuff");
    const registryData = await getSxContracts();
    if (this.isAuthenticated) {
      vxm.tlosNetwork.getBalances({
        tokens: registryData.flatMap(data => data.tokens),
        slow: false
      });
    }

    const contracts = registryData.map(x => x.contract);

    this.checkPrices(contracts);
    this.setContracts(contracts);
    const allTokens = await Promise.all(contracts.map(this.fetchContract));
    this.setStats(allTokens);

    this.connector = await retryPromise(() => get_connector(rpc), 4, 500);
//    console.log("refresh.connector", this.connector);

    retryPromise(() => this.updateStats(), 4, 1000);

    const all = await Promise.all(
      allTokens.flatMap(token =>
        this.buildTokens({
          tokens: token.tokens,
          volume: token.volume[0],
          settings: token.settings,
          connector: this.connector
        })
      )
    );

    const allWithId: SxToken[] = all.flatMap(x =>
      x.map(token => ({
        ...token,
        id: buildTokenId(token)
      }))
    );

    const uniqTokens = _.uniqBy(allWithId, "id").map(x => x.id);

    const newTokens = uniqTokens.map(
      (id): SxToken => {
        const allTokensOfId = allWithId.filter(token =>
          compareString(id, token.id)
        );

        const { precision, contract, symbol } = allTokensOfId[0];

        const [highestLiquidityToken] = allTokensOfId.sort(
          (a, b) => b.liqDepth - a.liqDepth
        );

        const { price } = highestLiquidityToken;

        const totalVolumeInToken = allTokensOfId
          .map(token => token.volume24h)
          .reduce(addNumbers, 0);

        const liqDepth = allTokensOfId
          .map(token => token.liqDepth)
          .reduce(addNumbers, 0);

        const volumeInPrice = price * totalVolumeInToken;

        return {
          precision,
          price,
          contract,
          id,
          liqDepth,
          symbol,
          volume24h: volumeInPrice
        };
      }
    );

    this.setNewTokens(newTokens);
    await wait(10);
  }

  @action async init(params?: ModuleParam) {
    if (this.initiated) {
      return this.refresh();
    }
    console.time("sx");
    vxm.tlosBancor.init();

    const registryData = await getSxContracts();
    if (this.isAuthenticated) {
      vxm.tlosNetwork.getBalances({
        tokens: registryData.flatMap(data => data.tokens),
        slow: false
      });
    }

    const contracts = registryData.map(x => x.contract);

    await this.checkPrices(contracts);
    this.setContracts(contracts);
    const allTokens = await Promise.all(contracts.map(this.fetchContract));
    this.setStats(allTokens);

    this.connector = await retryPromise(() => get_connector(rpc), 4, 500);
//    console.log("init.connector", this.connector);

    await retryPromise(() => this.updateStats(), 4, 1000);

    const all = await Promise.all(
      allTokens.flatMap(token =>
        this.buildTokens({
          tokens: token.tokens,
          volume: token.volume[0],
          settings: token.settings,
          connector: this.connector
        })
      )
    );

    setInterval(() => this.checkRefresh(), 20000);

    const allWithId: SxToken[] = all.flatMap(x =>
      x.map(token => ({
        ...token,
        id: buildTokenId(token)
      }))
    );

    const uniqTokens = _.uniqBy(allWithId, "id").map(x => x.id);

    const newTokens = uniqTokens.map(
      (id): SxToken => {
        const allTokensOfId = allWithId.filter(token =>
          compareString(id, token.id)
        );

        const { precision, contract, symbol } = allTokensOfId[0];

        const [highestLiquidityToken] = allTokensOfId.sort(
          (a, b) => b.liqDepth - a.liqDepth
        );

        const { price } = highestLiquidityToken;

        const totalVolumeInToken = allTokensOfId
          .map(token => token.volume24h)
          .reduce(addNumbers, 0);

        const liqDepth = allTokensOfId
          .map(token => token.liqDepth)
          .reduce(addNumbers, 0);

        const volumeInPrice = price * totalVolumeInToken;

        return {
          precision,
          price,
          contract,
          id,
          liqDepth,
          symbol,
          volume24h: volumeInPrice
        };
      }
    );

    this.setNewTokens(newTokens);
    this.moduleInitiated();
    await wait(10);
    console.timeEnd("sx");
  }

  @action async buildTokens({
    tokens,
    volume,
    settings,
    connector
  }: {
    tokens: Tokens;
    settings: Settings;
    volume: Volume;
    connector: Connector;
  }) {
    const tokensArray: Token[] = tokensToArray(tokens);
    const addedPossibleVolumes: AddedVolume[] = tokensArray.map(token => {
      const symbolName = token.sym.code().to_string();
      const hasVolume = Object.keys(volume.volume).includes(symbolName);
      return hasVolume
        ? { ...token, volume24h: volume.volume[symbolName] }
        : token;
    });

    const newTokens = await Promise.all(
      addedPossibleVolumes.map(async token => {
        const symbolName = token.sym.code().to_string();
        const precision = token.sym.precision();
        const contract = trusted ? token.contract.to_string() : symbolNameToContract(symbolName);

//        console.log("buildTokens", token.token_type.to_string());
        if (token.token_type.to_string() == "connector") {
          const volume24h = connector.volume_24h;
          const price = connector.price;
          const liqDepth = connector.tlosd_liquidity_depth;

//          console.log("buildTokens.connector", symbol, volume24h, price, liqDepth);

          return {
            id: buildTokenId({ contract, symbol: symbolName }),
            symbol: symbolName,
            precision,
            contract,
            volume24h,
            price,
            liqDepth
          };
        } else {
          const volume24h = token.volume24h || 0;
          const rate = await get_spot_price(
            "USDT",
            token.sym.code(),
            tokens,
            settings
          );
          const price = compareString(symbolName, "USDT") ? 1 : rate;

//          console.log("buildTokens", symbol, volume24h, price);

          return {
            id: buildTokenId({ contract, symbol: symbolName }),
            symbol: symbolName,
            precision,
            contract,
            volume24h,
            price,
            liqDepth: asset_to_number(token.balance) * price
          };
        }
      })
    );

    return newTokens;
  }

  @mutation setNewTokens(tokens: any[]) {
    this.newTokens = tokens;
  }

  @action async tokenById(id: string) {
    return findOrThrow(
      this.newTokens,
      token => compareString(token.id, id),
      `failed to find ${id} in sx tokenById`
    );
  }

  @action async viewAmountToAsset(amount: ViewAmount) {
    const token = await this.tokenById(amount.id);
    return number_to_asset(
      Number(amount.amount),
      new Sym(token.symbol, token.precision)
    );
  }

  @action async focusSymbol(symbolName: string) {
    const tokens = this.newTokens.filter(token =>
      compareString(token.symbol, symbolName)
    );
    if (this.isAuthenticated) {
      await vxm.tlosNetwork.getBalances({
        tokens: tokens.map(token => ({
          contract: token.contract,
          symbol: token.symbol
        }))
      });
    }
  }

  @action async refreshBalances(symbols: BaseToken[] = []) {}

  get isAuthenticated() {
    // @ts-ignore
    return this.$store.rootGetters[`${this.wallet}Wallet/isAuthenticated`];
  }

  @action async convert(propose: ProposedConvertTransaction) {
    if (compareString(propose.from.id, propose.to.id))
      throw new Error("Cannot convert a token to itself.");
    const accountName = this.isAuthenticated;

    const fromToken = await this.tokenById(propose.from.id);
    const toToken = await this.tokenById(propose.to.id);

    const tokens = [fromToken, toToken];

    const amountAsset = await this.viewAmountToAsset(propose.from);

    const tokenContract = fromToken.contract;

    const poolReward = await this.bestFromReturn({
      from: propose.from,
      toId: propose.to.id
    });

    let connectors = ["TLOS", "TLOSD"];
    let converter = "";
    let memo = "";

    if (
      connectors.indexOf(fromToken.symbol) >= 0 &&
      connectors.indexOf(toToken.symbol) >= 0
    ) {
      // Case TLOS<->TLOSD, use V1 converter
      converter = "bancor.tbn";
      memo = "1,tlosdx.swaps " + toToken.symbol + ",0.0," + accountName;
    } else if (fromToken.symbol == "TLOS") {
      // Case from=TLOS, to<>TLOSD
      // 1,tlosdx.swaps TLOSD telosd.swaps USDT,0.0,qwertyqwerty
      converter = "bancor.tbn";
      memo =
        "1,tlosdx.swaps TLOSD telosd.swaps " +
        toToken.symbol +
        ",0.0," +
        accountName;
    } else if (toToken.symbol == "TLOS") {
      // Case from<>TLOSD, to=TLOS
      // 1,telosd.swaps TLOSD tlosdx.swaps TLOS,0.0,qwertyqwerty
      converter = "bancor.tbn";
      memo = "1,telosd.swaps TLOSD tlosdx.swaps TLOS,0.0," + accountName;
    } else {
      // Case not involving TLOS
      converter = poolReward.id;
      memo = toToken.symbol;
    }

    //    console.log("data :",'["', accountName, '", "', converter, '", "', amountAsset.to_string(), '", "', memo, '"]');
    //    console.log("memo :", memo);

    // 1,tlosdx.swaps TLOSD,0.9890,qwertyqwerty
    // 1,tlosdx.swaps TLOSD,0.0,   qwertyqwerty
    // USDT
    // TLOSD@bancor.tbn|1,tlosdx.swaps TLOS,0.0,admin.swaps;USDT->TLOSD->TLOS
    // 1,tlosdx.swaps TLOSD,0.0,telosd.swaps;USDT@qwertyqwerty
    // TLOS@bancor.tbn|1,tlosdx.swaps TLOSD,0.0,qwertyqwerty

    // TLOSD@bancor.tbn|1,tlosdx.swaps TLOS,0.0,qwertyqwerty;USDT->TLOSD->TLOS
    // TLOSD@qwertyqwerty|1,tlosdx.swaps TLOS,0.0,qwertyqwerty;USDT->TLOSD->TLOS
    // TLOSD@qwertyqwerty|1,tlosdx.swaps TLOS,0.0,qwertyqwerty;USDT->TLOSD->TLOS
    // 1,tlosdx.swaps TLOS,0.0,qwertyqwerty;USDT->TLOSD->TLOS
    // TLOSD@bancor.tbn|1,tlosdx.swaps TLOS,0.0,qwertyqwerty;USDT->TLOSD->TLOS
    // Try switch off mine.reward

    // TLOSD@bancor.tbn|1,tlosdx.swaps TLOS,0.0,qwertyqwerty;USDT->TLOSD->TLOS
    // TLOSD@bancor.tbn|1,tlosdx.swaps TLOS,0.0,qwertyqwerty;USDT->TLOSD->TLOS
    // 1,tlosdx.swaps TLOSD,0.0,telosd.swaps;USDT@qwertyqwerty
    // 1,tlosdx.swaps TLOSD telosd.swaps USDT,0.0,qwertyqwerty
    // 1,telosd.swaps TLOSD tlosdx.swaps TLOS,0.0,qwertyqwerty

    const [txRes, originalBalances] = await Promise.all([
      this.triggerTx([
        {
          account: tokenContract,
          name: "transfer",
          data: {
            from: accountName,
            to: converter,
            memo: memo,
            quantity: amountAsset.to_string()
          }
        }
      ]),
      vxm.tlosNetwork.getBalances({
        tokens
      })
    ]);
    await vxm.tlosNetwork.pingTillChange({ originalBalances });

    return txRes.transaction_id;
  }

  @action async triggerTx(actions: any[]) {
    // @ts-ignore
    return this.$store.dispatch("tlosWallet/tx", actions, { root: true });
  }

  @action async checkRefresh() {
    const biggestGap = 5000;
    const timeNow = new Date().getTime();
    if (this.lastLoaded + biggestGap < timeNow) {
      await this.updateStats();
    }
  }

  @action async getTradeData({
    propose
  }: {
    propose: ProposedFromTransaction | ProposedToTransaction;
  }) {
    if (Object.keys(propose).includes("from")) {
      const data = propose as ProposedFromTransaction;

      const toToken = await this.tokenById(data.toId);

      const amountAsset = await this.viewAmountToAsset(data.from);
      const opposingSymbol = symbol(toToken.symbol, toToken.precision);

      return { opposingSymbol, amountAsset };
    } else {
      const data = propose as ProposedToTransaction;

      const fromToken = await this.tokenById(data.fromId);

      const amountAsset = await this.viewAmountToAsset(data.to);
      const opposingSymbol = symbol(fromToken.symbol, fromToken.precision);

      return { opposingSymbol, amountAsset };
    }
  }

  @action async returnAcrossPools({
    calculator,
    tokenIds
  }: {
    calculator: (tokens: Tokens, settings: Settings) => RateDetail;
    tokenIds: string[];
  }): Promise<PoolReturn[]> {
    if (tokenIds.length !== 2)
      throw new Error("Can only trade between two tokens");

    const miniRelays: MiniRelay[] = this.stats.map(
      (stat): MiniRelay => ({
        id: stat.contract,
        tokenIds: tokensToArray(stat.tokens).map(tokenToId)
      })
    );

    const [fromId, toId] = tokenIds;

    const poolCandidates = miniRelays.filter(
      relay => relay.tokenIds.includes(fromId) && relay.tokenIds.includes(toId)
    );

    if (poolCandidates.length == 0)
      throw new Error(
        "Failed to find pool to facilitate trade, please convert to TLOS or TLOSD first"
      );

    const hydratedPools = this.stats.filter(stat =>
      poolCandidates.some(pool => compareString(stat.contract, pool.id))
    );

    return hydratedPools.map(pool => ({
      id: pool.contract,
      amount: calculator(pool.tokens, pool.settings)
    }));
  }

  @action async bestFromReturn(
    propose: ProposedFromTransaction
  ): Promise<PoolReturn> {
    const { opposingSymbol, amountAsset } = await this.getTradeData({
      propose
    });

    const poolResults = await this.returnAcrossPools({
      calculator: (tokens, settings) =>
        getRate(amountAsset, opposingSymbol, tokens, settings),
      tokenIds: [propose.from.id, propose.toId]
    });

    const sortedByAmount = poolResults.sort((a, b) =>
      b.amount.rate.isLessThan(a.amount.rate) ? -1 : 1
    );

    return sortedByAmount[0];
  }

  @action async bestToReturn(propose: ProposedToTransaction) {
    const { opposingSymbol, amountAsset } = await this.getTradeData({
      propose
    });

    const poolResults = await this.returnAcrossPools({
      calculator: (tokens, settings) =>
        getInverseRate(amountAsset, opposingSymbol, tokens, settings),
      tokenIds: [propose.fromId, propose.to.id]
    });

    const sortedByAmount = poolResults.sort((a, b) =>
      b.amount.rate.isGreaterThan(a.amount.rate) ? -1 : 1
    );

    return sortedByAmount[0];
  }

  @action async getReturn(propose: ProposedFromTransaction) {
    if (compareString(propose.from.id, propose.toId))
      throw new Error("Cannot convert a token to itself.");
    await this.checkRefresh();

//    console.log("getReturn.connector", this.connector);
//    console.log("getReturn.propose", propose, propose.from.id, propose.toId, propose.from.amount);

    // Hack to handle TLOS<->TLOSD
    // From : "eosio.token-TLOS" -> "tokens.swaps-TLOSD"
    //        {id: "eosio.token-TLOS", amount: "1"}
    // To   : "tokens.swaps-TLOSD" -> "eosio.token-TLOS"
    let additional_fee = 0.0;
    let factor = 1.0;
    if (propose.from.id == "eosio.token-TLOS") {
      propose.from.id = "tokens.swaps-TLOSD";
      // propose.from.amount = (Number(propose.from.amount) * Number(this.connector[2])).toString();
      // 0: 154200.619, 1: 2121.502, 2: 0.01375806409700599, 3: "2.3043"
      const base_reserve = Number(this.connector.tlos_liquidity_depth);
      const quote_reserve = Number(this.connector.tlosd_liquidity_depth);
      const quantity = Number(propose.from.amount);
      // Hardcoded (1 - fee) * bancor return
      propose.from.amount = (0.9925 * get_bancor_output(base_reserve, quote_reserve, quantity)).toString();
      additional_fee = 0.0027 * Number(propose.from.amount) / 0.9925;
    }
    if (propose.toId == "eosio.token-TLOS") {
      propose.toId = "tokens.swaps-TLOSD";
      // propose.from.amount = (Number(propose.from.amount) / Number(this.connector[2])).toString();
      const base_reserve = Number(this.connector.tlosd_liquidity_depth);
      const quote_reserve = Number(this.connector.tlos_liquidity_depth);
      const quantity = Number(propose.from.amount);
      // Hardcoded (1 - fee) * bancor return
      propose.from.amount = (0.9925 * get_bancor_output(base_reserve, quote_reserve, quantity)).toString();
      additional_fee = 0.0027 * Number(propose.from.amount) / 0.9925;
      factor = base_reserve / quote_reserve;
    }

//    console.log("getReturn.propose", propose, propose.from.id, propose.toId, propose.from.amount);

    const bestReturn = await this.bestFromReturn(propose);

    // Need to update fee and slippage too
    // TODO fee specified in "to" token units
    let total_fee = number_to_asset((asset_to_number(bestReturn.amount.fee) + additional_fee) * factor, bestReturn.amount.fee.symbol).to_string();
    let slippage = bestReturn.amount.slippage * factor;

//    console.log("getReturn.bestReturn", bestReturn.amount.fee.to_string(), additional_fee, slippage, factor);

    return {
      amount: String(asset_to_number(bestReturn.amount.rate)),
//      fee: shortAssetString(bestReturn.amount.fee),
      fee: total_fee,
//      slippage: bestReturn.amount.slippage
      slippage: slippage
    };
  }

  @action async getCost(propose: ProposedToTransaction) {
    if (compareString(propose.fromId, propose.to.id))
      throw new Error("Cannot convert a token to itself.");
    await this.checkRefresh();

    const cheapestCost = await this.bestToReturn(propose);

    return {
      amount: String(asset_to_number(cheapestCost.amount.rate)),
      fee: shortAssetString(cheapestCost.amount.fee),
      slippage: cheapestCost.amount.slippage
    };
  }

  @mutation resetTimer() {
    this.lastLoaded = new Date().getTime();
  }

  @action async updateStats() {
    this.resetTimer();
    const contracts = this.contracts;
    const allTokens = await Promise.all(contracts.map(this.fetchContract));

    this.setStats(allTokens);
  }

  @mutation setStats(stats: Stat[]) {
    this.stats = stats;
    this.lastLoaded = new Date().getTime();
  }
}
