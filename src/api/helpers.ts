import axios, { AxiosResponse } from "axios";
import { vxm } from "@/store";
import { JsonRpc } from "eosjs";
import { Asset, number_to_asset, Sym } from "eos-common";
import { rpc, xrpc } from "./rpc";
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
import { Chain, EosTransitModule } from "@/store/modules/wallet/tlosWallet";
import wait from "waait";
import { sortByNetworkTokens } from "./sortByNetworkTokens";

export const networkTokens = ["TLOS"];

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
const eosRpc: JsonRpc = xrpc;

interface TraditionalStat {
  supply: Asset;
  max_supply: Asset;
}

/*
1
telosd.swaps
[ "USDT", "TLOSD", "TLOSM", "EOSDT" ]
[ { "sym": "4,USDT", "contract": "tokens.swaps" }, { "sym": "4,TLOSD", "contract": "tokens.swaps" }, { "sym": "8,TLOSM", "contract": "tokens.swaps" }, { "sym": "9,EOSDT", "contract": "tokens.swaps" } ]

telosd.io
[ "BTC", "EOS", "BNT", "USDT", "VIGOR", "EOSDT" ]
[ { "sym": "8,BTC", "contract": "tokens.swaps" }, { "sym": "4,EOS", "contract": "tokens.swaps" }, { "sym": "10,BNT", "contract": "tokens.swaps" }, { "sym": "4,USDT", "contract": "tokens.swaps" }, { "sym": "4,VIGOR", "contract": "tokens.swaps" }, { "sym": "9,EOSDT", "contract": "tokens.swaps" } ]



1	{ "sym": "8,BTC", "contract": "tokens.swaps" }	1	0.00010000 BTC	eos	{ "sym": "8,PBTC", "contract": "btc.ptokens" }	1
2	{ "sym": "4,EOS", "contract": "tokens.swaps" }	1	0.2500 EOS	eos	{ "sym": "4,EOS", "contract": "eosio.token" }	1
3	{ "sym": "10,BNT", "contract": "tokens.swaps" }	1	0.2500000000 BNT	eos	{ "sym": "10,BNT", "contract": "bntbntbntbnt" }	1
4	{ "sym": "4,USDT", "contract": "tokens.swaps" }	1	1.0000 USDT	eos	{ "sym": "4,USDT", "contract": "tethertether" }	1
5	{ "sym": "4,VIGOR", "contract": "tokens.swaps" }	1	1.0000 VIGOR	eos	{ "sym": "4,VIGOR", "contract": "vigortoken11" }	1
6	{ "sym": "9,EOSDT", "contract": "tokens.swaps" }	1	1.000000000 EOSDT	eos	{ "sym": "9,EOSDT", "contract": "eosdtsttoken" }	1
 */

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

// https://api.coingecko.com/api/v3/simple/price?ids=telos&vs_currencies=usd
// {"telos":{"usd":0.02797187}}
//export const fetchCoinGechoUsdPriceOfTlos = async (): Promise<number> => {
//  const res = await axios.get<{ telos: { usd: string } }>(
//    "https://api.coingecko.com/api/v3/simple/price?ids=telos&vs_currencies=usd"
//  );
//  return Number(res.data.telos.usd);
//};

export const fetchCoinGechoUsdPriceOfEos = async (): Promise<number> => {
  const res = await axios.get<{ eos: { usd: string } }>(
    "https://api.coingecko.com/api/v3/simple/price?ids=eos&vs_currencies=usd"
  );
  console.log("fetchCoinGechoUsdPriceOfEos",Number(res.data.eos.usd));
  return Number(res.data.eos.usd);
};

// 902e192a-d57a-49ac-986d-01b5f3a1b922
//
// curl -H "X-CMC_PRO_API_KEY: 902e192a-d57a-49ac-986d-01b5f3a1b922" -H "Accept: application/json" -d "id=4660" -G https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest
/*
curl -H "X-CMC_PRO_API_KEY: 902e192a-d57a-49ac-986d-01b5f3a1b922" -H "Accept: application/json" -d "symbol=TLOS&convert=USD" -G https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest
curl -H "X-CMC_PRO_API_KEY: 902e192a-d57a-49ac-986d-01b5f3a1b922" -H "Accept: application/json" -d "id=4660&convert=USD" -G https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest

https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=4660&convert=USD&CMC_PRO_API_KEY=902e192a-d57a-49ac-986d-01b5f3a1b922

{
   "status":{
      "timestamp":"2020-10-03T08:37:14.664Z",
      "error_code":0,
      "error_message":null,
      "elapsed":10,
      "credit_count":1,
      "notice":null
   },
   "data":{
      "TLOS":{
         "id":4660,
         "name":"Telos",
         "symbol":"TLOS",
         "slug":"telos",
         "num_market_pairs":4,
         "date_added":"2019-09-17T00:00:00.000Z",
         "tags":[
            "services",
            "enterprise-solutions"
         ],
         "max_supply":null,
         "circulating_supply":270123443.84430003,
         "total_supply":355208370.6674,
         "platform":{
            "id":1765,
            "name":"EOS",
            "symbol":"EOS",
            "slug":"eos",
            "token_address":""
         },
         "is_active":1,
         "cmc_rank":675,
         "is_fiat":0,
         "last_updated":"2020-10-03T08:36:43.000Z",
         "quote":{
            "USD":{
               "price":0.01815647220941,
               "volume_24h":37271.37537728,
               "percent_change_1h":-0.55264775,
               "percent_change_24h":-10.14481831,
               "percent_change_7d":-19.06913511,
               "market_cap":4904488.801269156,
               "last_updated":"2020-10-03T08:36:43.000Z"
            }
         }
      }
   }
}

curl -H "X-CMC_PRO_API_KEY: 902e192a-d57a-49ac-986d-01b5f3a1b922" -H "Accept: application/json" -G https://pro-api.coinmarketcap.com/v1/cryptocurrency/map

      {
         "id":4660,
         "name":"Telos",
         "symbol":"TLOS",
         "slug":"telos",
         "rank":668,
         "is_active":1,
         "first_historical_data":"2019-09-19T05:29:13.000Z",
         "last_historical_data":"2020-10-03T08:24:42.000Z",
         "platform":{
            "id":1765,
            "name":"EOS",
            "symbol":"EOS",
            "slug":"eos",
            "token_address":""
         }
      }
 */

//export const fetchCmcUsdPriceOfTlos = async (): Promise<number> => {
//  const res = await axios.get< any >(
//    "http://localhost/quotes/latest?id=4660&convert=USD&CMC_PRO_API_KEY=902e192a-d57a-49ac-986d-01b5f3a1b922"
//  );
//  console.log("fetchCoinCmcUsdPriceOfTlos", res);

//  const CoinMarketCap = require("coinmarketcap-api");

//  const apiKey = "902e192a-d57a-49ac-986d-01b5f3a1b922";
//  const client = new CoinMarketCap(apiKey);
//  client
//    .getQuotes({ symbol: "TLOS" })
//    .then(console.log)
//    .catch(console.error);

//  return Number(1.0);
//};
/*
export const fetchCoinGechoUsdPriceOfTlos = async (): Promise<number> => {
  const res = await axios.get<{ telos: { usd: string } }>(
    "https://api.coingecko.com/api/v3/simple/price?ids=telos&vs_currencies=usd"
  );
  return Number(res.data.telos.usd);
};

Tlos24hPriceMove
 */
export interface TlosCmcPriceData {
  price: null | number;
  percent_change_24h: null | number;
}

export const fetchCmcUsdPriceOfTlos = async (): Promise<TlosCmcPriceData> => {
  const res = await axios
    .get<any>(
      //"http://localhost:8080/v1/cryptocurrency/quotes/latest?id=4660&convert=USD&CMC_PRO_API_KEY=902e192a-d57a-49ac-986d-01b5f3a1b922"
      "https://cors-anywhere.herokuapp.com/https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=4660&convert=USD&CMC_PRO_API_KEY=902e192a-d57a-49ac-986d-01b5f3a1b922"
    )
//    .then(resp => {
//      console.log("fetchCoinCmcUsdPriceOfTlos", resp);
//    })
//    .catch(err => {
//      console.log("fetchCoinCmcUsdPriceOfTlos", err);
//    });

//  console.log("fetchCoinCmcUsdPriceOfTlos", res.data.data[4660].quote.USD);
  const price = Number(res.data.data[4660].quote.USD.price);
  const percent_change_24h = Number(res.data.data[4660].quote.USD.percent_change_24h);

  return {price:price,percent_change_24h:percent_change_24h};
};

export interface TlosNewdexPriceData {
  price: null | number;
  percent_change_24h: null | number;
}

export const fetchNewdexEosPriceOfTlos = async (): Promise<TlosNewdexPriceData> => {
  const res = await axios
      .get<any>(
          //"https://api.newdex.io/v1/ticker?symbol=eosio.token-tlos-eos"
          "https://api.newdex.io/v1/ticker?symbol=eosio.token-tlos-eos"
      )
//    .then(resp => {
//      console.log("fetchNewdexEosPriceOfTlos", resp);
//    })
//    .catch(err => {
//      console.log("fetchNewdexEosPriceOfTlos", err);
//    });

//  console.log("fetchNewdexEosPriceOfTlos", res);
  const price = Number(res.data.data.last);
  const percent_change_24h = Number(res.data.data.change);

  return {price:price,percent_change_24h:percent_change_24h};
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
  } = (vxm.tlosWallet.chain == Chain.telos) ?
      await rpc.get_table_rows({code: contractName, scope: symbolName, table: "stat"}) :
      await xrpc.get_table_rows({code: contractName, scope: symbolName, table: "stat"});

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
      const symbol = await fetchTokenSymbol(contract, symbolName);
      // TODO this is a hack because number_to_asset cannot just receive a symbol, precision is essential
      return number_to_asset(0, new Sym(symbolName, 4)).to_string();
      // return number_to_asset(0, symbol).to_string();
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
  /*
  const res = await axios.get<TokenBalances>(
    `https://telos.caleos.io/v2/state/get_tokens?account=${accountName}`
//    `https://telos.eosphere.io/v2/state/get_tokens?account=${accountName}`
  );
  console.log("getTokenBalances : ", res);
  return {
    ...res.data,
    tokens: res.data.tokens.filter(isValidBalance)
  };

   */
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
  Liquidity,
  Bridge
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
  { namespace: "usds", features: [Feature.Trade, Feature.Wallet] },
  { namespace: "xchain", features: [Feature.Bridge] }
];

export interface ReserveTableRow {
  contract: string;
  ratio: number;
  balance: string;
}

export interface SettingTableRow {
  currency: string;
  owner: string;
  stake_enabled: boolean;
  fee: number;
}

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

interface BaseSymbol {
  symbol: string;
  precision: number;
}

const symToBaseSymbol = (symbol: Sym): BaseSymbol => ({
  symbol: symbol.code().to_string(),
  precision: symbol.precision()
});

const assetStringtoBaseSymbol = (assetString: string): BaseSymbol => {
  const asset = new Asset(assetString);
  return symToBaseSymbol(asset.symbol);
};

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
    reserves: sortByNetworkTokens(relay.reserves, reserve => reserve.symbol, ["TLOS"])
  };
};

const tokenMetaDataEndpoint =
  "https://raw.githubusercontent.com/Telos-Swaps/Seeds-swaps-UI-prototype/master/tokens/tokens.json";

export const getTokenMeta = async (): Promise<TokenMeta[]> => {
  const res: AxiosResponse<TokenMeta[]> = await axios.get(
    tokenMetaDataEndpoint
  );

//  console.log("getTokenMeta",[...res.data]);

  //  return [...res.data, ...hardCoded()]
  return [...res.data]
    .filter(token => compareString(token.chain, "eos"))
    .map(token => ({
      ...token,
      id: buildTokenId({ contract: token.account, symbol: token.symbol })
    }));
};

export interface TickerPrice {
  "15m": number;
  last: number;
  buy: number;
  sell: number;
  symbol: string;
}
//      //  getTokens(): Promise<TokenPrice[]>;

// cleos --url https://api.telos.africa get table data.tbn data.tbn tradedata -L tlosdx.swaps -l 1
/*
{
  "rows": [{
      "converter": "tlosdx.swaps",
      "timestamp": "2020-11-08T10:04:49",
      "volume_24h": [{"key": "TLOS","value": "564.1180 TLOS"},{"key": "TLOSD","value": "7.7665 TLOSD"}],
      "volume_cumulative": [{"key": "TLOS","value": "20779.7151 TLOS"},{"key": "TLOSD","value": "387.0396 TLOSD"}],
      "price": [{"key": "TLOS","value": "72.00000000000000000"},{"key": "TLOSD","value": "0.01388888888888889"}],
      "price_change_24h": [{"key": "TLOS","value": "-0.07128514056225299"},{"key": "TLOSD","value": "0.00001373739062329"}],
      "liquidity_depth": [{"key": "TLOS","value": "69098.8886 TLOS"},{"key": "TLOSD","value": "950.1844 TLOSD"}],
      "smart_price": [{"key": "TLOS","value": "0.68491061533971465"},{"key": "TLOSD","value": "0.00941826120905507"}],
      "smart_price_change_30d": [{"key": "TLOS","value": "0.13301394155961210"},{"key": "TLOSD","value": "-0.00216214369359566"}]
    }]
}

TLOSDpriceOfTLOS = 0.01388888888888889
USDTpriceOfTLOS = 0.01388888888888889 * USDTpriceOfTLOSD
Liquidity depth = 2 * 950.1844 TLOSD
 */
export const fetchTradeData = async (): Promise<TokenPrice[]> => {
  const rawTradeData = await telosRpc.get_table_rows({
    code: "data.tbn",
    table: "tradedata",
    scope: "data.tbn",
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
  console.log("usdTlos24hPriceMove",usdTlos24hPriceMove);

  let newTlosObj: any = {};
  newTlosObj.id = 1;
  newTlosObj.code = "TLOS";
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
      (token: any) => !compareString(token.key, "TLOS")
    ).key;
    newObj.name = newObj.code;
    newObj.primaryCommunityImageName = newObj.code;
    newObj.liquidityDepth =
      itemObject.liquidity_depth
        .find((token: any) => compareString(token.key, "TLOS"))
        .value.split(" ")[0] * usdPriceOfTlos * 2.0;
    newObj.price =
      itemObject.price.find((token: any) => compareString(token.key, "TLOS"))
        .value * usdPriceOfTlos;
//    newObj.priceTlos =
//      itemObject.price.find((token: any) => compareString(token.key, "TLOS")).value;

    // This is to convert from % change in TLOS to USD
    let raw24hChange =
      itemObject.price_change_24h.find((token: any) =>
        compareString(token.key, "TLOS")
      ).value * usdPriceOfTlos;
    let a = 1.0 / (1.0 + usdTlos24hPriceMove);
    newObj.change24h = 100.0 * (newObj.price / (a * (newObj.price - raw24hChange)) - 1.0);

    let volume24h: any = {};
    volume24h.USD =
      itemObject.volume_24h
        .find((token: any) => compareString(token.key, "TLOS"))
        .value.split(" ")[0] * usdPriceOfTlos;
    newObj.volume24h = volume24h;

    // TODO smart token APR needs to be incuded in "pools" tab, calculations follow, APR in TLOS
    let smartPrice = itemObject.smart_price
      .find((token: any) => compareString(token.key, "TLOS"))
      .value.split(" ")[0];
    let smartPriceApr = itemObject.smart_price_change_30d
      .find((token: any) => compareString(token.key, "TLOS"))
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
