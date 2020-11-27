import axios, { AxiosResponse } from "axios";
import { vxm } from "@/store";
import { JsonRpc } from "eosjs";
import { Asset, number_to_asset, Sym } from "eos-common";
import { rpc } from "./rpc";
import {
  BaseToken,
  EosMultiRelay,
  OnUpdate,
  Step,
  TokenBalanceParam,
  TokenBalanceReturn,
  TokenBalances,
  TokenMeta,
  TokenPrice
} from "@/types/bancor";
import { EosTransitModule } from "@/store/modules/wallet/tlosWallet";
import wait from "waait";
import { sortByNetworkTokens } from "./sortByNetworkTokens";

export const networkTokens = ["SEEDS"];

export const isOdd = (num: number) => num % 2 == 1;

interface TaskItem {
  description: string;
  task: (state?: any) => Promise<any>;
}

export const multiSteps = async ({
  items,
  onUpdate
}: {
  items: TaskItem[];
  onUpdate?: OnUpdate;
}) => {
  let state: any = {};
  for (const todo in items) {
    let steps = items.map(
      (todo, index): Step => ({
        name: String(index),
        description: todo.description
      })
    );
    if (typeof onUpdate == "function") {
      onUpdate(Number(todo), steps);
    } else if (typeof onUpdate !== "undefined") {
      throw new Error("onUpdate should be either a function or undefined");
    }

    let newState = await items[todo].task(state);
    if (typeof newState !== "undefined") {
      state = newState;
    }
  }
  return state;
};

const telosRpc: JsonRpc = rpc;

interface TraditionalStat {
  supply: Asset;
  max_supply: Asset;
}

export const getSxContracts = async () => {
  const res = (await rpc.get_table_rows({
    code: "config.swaps",
    table: "swap",
    scope: "config.swaps"
  })) as {
    rows: {
      contract: string;
      ext_tokens: { sym: string; contract: string }[];
    }[];
  };
  return res.rows.map(set => ({
    contract: set.contract,
    tokens: set.ext_tokens.map(token => ({
      contract: token.contract,
      symbol: new Sym(token.sym).code().to_string()
    }))
  }));
};

export const findOrThrow = <T>(
  arr: T[],
  iteratee: (obj: T, index: number, arr: T[]) => unknown,
  message?: string
) => {
  const res = arr.find(iteratee);
  if (!res)
    throw new Error(message || "Failed to find object in find or throw");
  return res;
};

export const compareToken = (
  a: TokenBalanceParam | TokenBalanceReturn | BaseToken,
  b: TokenBalanceParam | TokenBalanceReturn | BaseToken
): boolean =>
  compareString(a.contract, b.contract) && compareString(a.symbol, b.symbol);

export const compareString = (stringOne: string, stringTwo: string) => {
  const strings = [stringOne, stringTwo];
  if (!strings.every(str => typeof str == "string"))
    throw new Error(
      `String one: ${stringOne} String two: ${stringTwo} one of them are falsy or not a string`
    );
  return stringOne.toLowerCase() == stringTwo.toLowerCase();
};

export const fetchCoinGechoUsdPriceOfEos = async (): Promise<number> => {
  const res = await axios.get<{ eos: { usd: string } }>(
    "https://api.coingecko.com/api/v3/simple/price?ids=eos&vs_currencies=usd"
  );
  return Number(res.data.eos.usd);
};

export interface TlosCmcPriceData {
  price: null | number;
  percent_change_24h: null | number;
}

export interface TlosNewdexPriceData {
  price: null | number;
  percent_change_24h: null | number;
}

export const fetchNewdexEosPriceOfTlos = async (): Promise<TlosNewdexPriceData> => {
  const res = await axios.get<any>(
    "https://api.newdex.io/v1/ticker?symbol=eosio.token-tlos-eos"
  );

  const price = Number(res.data.data.last);
  const percent_change_24h = Number(res.data.data.change);

  return { price: price, percent_change_24h: percent_change_24h };
};

export const updateArray = <T>(
  arr: T[],
  conditioner: (element: T) => boolean,
  updater: (element: T) => T
) => arr.map(element => (conditioner(element) ? updater(element) : element));

export const fetchReserveBalance = async (
  converterContract: any,
  reserveTokenAddress: string,
  versionNumber: number | string
): Promise<string> => {
  try {
    const res = await converterContract.methods[
      Number(versionNumber) >= 17 ? "getConnectorBalance" : "getReserveBalance"
    ](reserveTokenAddress).call();
    return res;
  } catch (e) {
    try {
      const res = await converterContract.methods[
        Number(versionNumber) >= 17
          ? "getReserveBalance"
          : "getConnectorBalance"
      ](reserveTokenAddress).call();
      return res;
    } catch (e) {
      throw new Error("Failed getting reserve balance" + e);
    }
  }
};

export const fetchTokenSymbol = async (
  contractName: string,
  symbolName: string
): Promise<Sym> => {
  const statRes: {
    rows: { supply: string; max_supply: string; issuer: string }[];
  } = await rpc.get_table_rows({
    code: contractName,
    scope: symbolName,
    table: "stat"
  });

  //  console.log("fetchTokenSymbol(",contractName,"",symbolName,")");
  if (statRes.rows.length == 0)
    throw new Error(
      `Unexpected stats table return from tokenContract ${contractName} ${symbolName}`
    );
  const maxSupplyAssetString = statRes.rows[0].max_supply;
  const maxSupplyAsset = new Asset(maxSupplyAssetString);
  return maxSupplyAsset.symbol;
};

export const getBalance = async (
  contract: string,
  symbolName: string,
  precision?: number
): Promise<string> => {
  const account = isAuthenticatedViaModule(vxm.tlosWallet);
  const res: { rows: { balance: string }[] } = await rpc.get_table_rows({
    code: contract,
    scope: account,
    table: "accounts",
    limit: 99
  });
  const balance = res.rows.find(balance =>
    compareString(
      new Asset(balance.balance).symbol.code().to_string(),
      symbolName
    )
  );

  if (!balance) {
    if (typeof precision == "number") {
      return number_to_asset(0, new Sym(symbolName, precision)).to_string();
    } else {
      // const symbol = await fetchTokenSymbol(contract, symbolName);
      // TODO this is a hack because number_to_asset cannot just receive a symbol, precision is essential
      return number_to_asset(0, new Sym(symbolName, 4)).to_string();
    }
  }

  return balance.balance;
};

export const fetchTokenStats = async (
  contract: string,
  symbol: string
): Promise<TraditionalStat> => {
  const tableResult = await telosRpc.get_table_rows({
    code: contract,
    table: "stat",
    scope: symbol,
    limit: 1
  });
  const tokenExists = tableResult.rows.length > 0;
  if (!tokenExists) throw new Error("Token does not exist");
  const { supply, max_supply } = tableResult.rows[0];
  return {
    supply: new Asset(supply),
    max_supply: new Asset(max_supply)
  };
};

export const retryPromise = async <T>(
  promise: () => Promise<T>,
  maxAttempts = 10,
  interval = 1000
): Promise<T> => {
  return new Promise(async (resolve, reject) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return resolve(await promise());
      } catch (e) {
        await wait(interval);
        if (i == maxAttempts) reject(e);
      }
    }
  });
};
const isValidBalance = (data: any): boolean =>
  typeof data.contract == "string" &&
  typeof data.symbol == "string" &&
  data.contract.length > 0 &&
  data.symbol.length > 0;

export const getTokenBalances = async (
  accountName: string
): Promise<TokenBalances> => {
  return { account: "", query_time: 0, tokens: [] };
};

export const identifyVersionBySha3ByteCodeHash = (sha3Hash: string): string => {
  if (
    sha3Hash ==
    "0xf0a5de528f6d887b14706f0e66b20bee0d4c81078b6de9f395250e287e09e55f"
  )
    return "11";
  throw new Error("Failed to identify version of Pool");
};

export type EosAccount = string;
export type ContractAccount = EosAccount;

export interface Token {
  symbol: string;
  contract: string;
  decimals: number;
  network: string;
}

export interface Relay {
  id: string;
  reserves: Token[];
  smartToken: Token;
  contract: ContractAccount;
  isMultiContract: boolean;
  fee: number;
  network: string;
  version: string;
  converterType?: number;
  owner: string;
}

const isAuthenticatedViaModule = (module: EosTransitModule) => {
  const isAuthenticated =
    module.wallet && module.wallet.auth && module.wallet.auth.accountName;
  if (!isAuthenticated) throw new Error("Not logged in");
  return isAuthenticated;
};

export const getBankBalance = async (): Promise<{
  id: number;
  quantity: string;
  symbl: string;
}[]> => {
  const account = isAuthenticatedViaModule(vxm.tlosWallet);
  const res: {
    rows: {
      id: number;
      quantity: string;
      symbl: string;
    }[];
  } = await rpc.get_table_rows({
    code: process.env.VUE_APP_MULTICONTRACT!,
    scope: account,
    table: "accounts"
  })!;
  return res.rows;
};

export enum Feature {
  Trade,
  Wallet,
  Liquidity
}

export interface Service {
  namespace: string;
  features: Feature[];
}

export const services: Service[] = [
  {
    namespace: "tlos",
    features: [Feature.Trade, Feature.Liquidity, Feature.Wallet]
  },
  { namespace: "usds", features: [Feature.Trade, Feature.Wallet] }
];

export interface ConverterV2Row {
  currency: string;
  fee: number;
  metadata_json: string[];
  owner: string;
  protocol_features: string[];
  reserve_balances: {
    key: string;
    value: {
      quantity: string;
      contract: string;
    };
  }[];
  reserve_weights: {
    key: string;
    value: number;
  }[];
}

export const buildTokenId = ({ contract, symbol }: BaseToken): string =>
  contract + "-" + symbol;

export const fetchMultiRelays = async (): Promise<EosMultiRelay[]> => {
  return [];
};

export const fetchMultiRelay = async (
  smartTokenSymbol: string
): Promise<EosMultiRelay> => {
  const relays = await fetchMultiRelays();
  const relay = findOrThrow(
    relays,
    relay => compareString(relay.smartToken.symbol, smartTokenSymbol),
    `failed to find multi relay with smart token symbol of ${smartTokenSymbol}`
  );
  return {
    ...relay,
    reserves: sortByNetworkTokens(relay.reserves, reserve => reserve.symbol, [
      "SEEDS"
    ])
  };
};

const tokenMetaDataEndpoint =
  "https://raw.githubusercontent.com/Telos-Swaps/Seeds-swaps-UI-prototype/master/tokens/tokens.json";

export const getTokenMeta = async (): Promise<TokenMeta[]> => {
  const res: AxiosResponse<TokenMeta[]> = await axios.get(
    tokenMetaDataEndpoint
  );

  return [...res.data]
    .filter(token => compareString(token.chain, "eos"))
    .map(token => ({
      ...token,
      id: buildTokenId({ contract: token.account, symbol: token.symbol })
    }));
};

export const fetchTradeData = async (): Promise<TokenPrice[]> => {
  const rawTradeData = await telosRpc.get_table_rows({
    code: "data.seedsx",
    table: "tradedata",
    scope: "data.seedsx",
    limit: 100
  });

  const dataExists = rawTradeData.rows.length > 0;
  if (!dataExists) throw new Error("Trade data not found");

  const parsedTradeData = rawTradeData.rows;

  let usdPriceOfTlos = await vxm.bancor.fetchUsdPriceOfTlos();
  // TODO read usdTlos24hPriceMove from CMC, use as follows
  // hardcoded for now
  //  let usdTlos24hPriceMove = -4.44 / 100.0;
  // let usdTlos24hPriceMove = 0.0 / 100.0;
  let usdTlos24hPriceMove = await vxm.bancor.fetchUsd24hPriceMove();
  //  console.log("usdTlos24hPriceMove",usdTlos24hPriceMove);

  let newTlosObj: any = {};
  newTlosObj.id = 1;
  newTlosObj.code = "SEEDS";
  newTlosObj.name = newTlosObj.code;
  newTlosObj.primaryCommunityImageName = newTlosObj.code;
  newTlosObj.liquidityDepth = 0.0;
  newTlosObj.price = usdPriceOfTlos;
  //  newTlosObj.priceTlos = 1;
  newTlosObj.change24h = 100.0 * usdTlos24hPriceMove;
  let volume24h: any = {};
  volume24h.USD = 0.0;
  newTlosObj.volume24h = volume24h;
  newTlosObj.smartPrice = 0.0;
  newTlosObj.smartPriceApr = 0.0;

  let newArr: any = [];
  let i = 2;
  parsedTradeData.forEach(function(itemObject: any) {
    let newObj: any = {};
    newObj.id = i;
    newObj.code = itemObject.liquidity_depth.find(
      (token: any) => !compareString(token.key, "SEEDS")
    ).key;
    newObj.name = newObj.code;
    newObj.primaryCommunityImageName = newObj.code;
    newObj.liquidityDepth =
      itemObject.liquidity_depth
        .find((token: any) => compareString(token.key, "SEEDS"))
        .value.split(" ")[0] *
      usdPriceOfTlos *
      2.0;
    newObj.price =
      itemObject.price.find((token: any) => compareString(token.key, "SEEDS"))
        .value * usdPriceOfTlos;
    //    newObj.priceTlos =
    //      itemObject.price.find((token: any) => compareString(token.key, "TLOS")).value;

    // This is to convert from % change in TLOS to USD
    let raw24hChange =
      itemObject.price_change_24h.find((token: any) =>
        compareString(token.key, "SEEDS")
      ).value * usdPriceOfTlos;
    let a = 1.0 / (1.0 + usdTlos24hPriceMove);
    newObj.change24h =
      100.0 * (newObj.price / (a * (newObj.price - raw24hChange)) - 1.0);

    let volume24h: any = {};
    volume24h.USD =
      itemObject.volume_24h
        .find((token: any) => compareString(token.key, "SEEDS"))
        .value.split(" ")[0] * usdPriceOfTlos;
    newObj.volume24h = volume24h;

    // TODO smart token APR needs to be incuded in "pools" tab, calculations follow, APR in TLOS
    let smartPrice = itemObject.smart_price
      .find((token: any) => compareString(token.key, "SEEDS"))
      .value.split(" ")[0];
    let smartPriceApr = itemObject.smart_price_change_30d
      .find((token: any) => compareString(token.key, "SEEDS"))
      .value.split(" ")[0];
    smartPriceApr = (smartPriceApr / (smartPrice - smartPriceApr)) * 100; // * 12;

    newObj.smartPrice = smartPrice;
    newObj.smartPriceApr = smartPriceApr;

    // TODO need to add USD price changes into trade data from Delphi Oracle
    // prices will then be where symbol = USD, not TLOS

    newTlosObj.liquidityDepth += newObj.liquidityDepth;
    newTlosObj.volume24h.USD += newObj.volume24h.USD;

    i++;
    newArr.push(newObj);
  });
  newArr.push(newTlosObj);

  return newArr;
};
