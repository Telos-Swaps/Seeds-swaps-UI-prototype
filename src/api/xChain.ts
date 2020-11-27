/*
Brief  : Extend sxjs to support telosd extensions
GitHib : https://github.com/stableex/sx.js

Changes required

1. Extend Token to include { maker_pool, token_type, enabled }
Original - https://github.com/stableex/sx.js/blob/04c035b09d9b8caf321a3a9c7bb293d434daf2ef/src/interfaces.ts#L16-L22
Telos$   - https://telos.bloks.io/account/telosd.swaps?loadContract=true&tab=Tables&account=telosd.swaps&scope=telosd.swaps&table=tokens

2. Modify get_spot_price() to handle liquidity token

*/

import {
  asset,
  check,
  symbol_code,
  number_to_asset,
  SymbolCode,
  asset_to_number,
  Asset,
  Sym,
  Name
} from "eos-common";
import { JsonRpc } from "eosjs";

export function get_bancor_output(
  base_reserve: number,
  quote_reserve: number,
  quantity: number
): number {
  const out = (quantity * quote_reserve) / (base_reserve + quantity);
  if (out < 0) return 0;
  return out;
}

export function get_bancor_input(
  quote_reserve: number,
  base_reserve: number,
  out: number
): number {
  const inp = (base_reserve * out) / (quote_reserve - out);
  if (inp < 0) return 0;
  return inp;
}

export function check_quantity(quantity: Asset | string): void {
  check(
    new Asset(quantity).amount.greater(0),
    "[quantity] amount must be positive"
  );
  check(new Asset(quantity).is_valid(), "[quantity] invalid symcode");
}

export function check_remaining_reserve(
  out: Asset | string,
  tokens: Tokens
): void {
  // validate input
  const token = tokens[new Asset(out).symbol.code().to_string()];
  check(!!token, "[symcode] token does not exist");
  const remaining = Asset.minus(token.reserve, new Asset(out));

  check(
    remaining.amount.greaterOrEquals(0),
    remaining.symbol.code().to_string() + " insufficient remaining reserve"
  );
}

export function get_fee(
  quantity: Asset | string,
  settings: Settings | { fee: number }
): Asset {
  const { amount, symbol } = asset(quantity);
  const fee = (settings.fee * Number(amount)) / 10000;

  return new Asset(fee, symbol);
}

export function get_inverse_fee(
  out: Asset | string,
  settings: Settings | { fee: number }
): Asset {
  const { amount, symbol } = asset(out);
  const fee =
    Number(amount) / ((10000 - settings.fee) / 10000) - Number(amount);

  return new Asset(fee, symbol);
}

export function get_price(
  quantity: Asset | string,
  symcode: SymbolCode | string,
  tokens: Tokens,
  settings: Settings | { amplifier: number }
): number {
  // params
  const _quantity = new Asset(quantity);
  const in_amount = asset_to_number(_quantity);
  const base = _quantity.symbol.code();
  const quote = new SymbolCode(symcode);

  // validation
  check_quantity(quantity);

  // upper limits
  const [base_upper, quote_upper] = get_uppers(base, quote, tokens, settings);

  // Bancor V1 Formula
  return get_bancor_output(base_upper, quote_upper, in_amount);
}

export function get_inverse_price(
  out: Asset | string,
  symcode: SymbolCode | string,
  tokens: Tokens,
  settings: Settings | { amplifier: number }
): Asset {
  // params
  const _out = new Asset(out);
  const base = _out.symbol.code();
  const quote = symbol_code(symcode);
  const quote_sym = tokens[quote.to_string()].balance.symbol;

  // validation
  check_quantity(_out);

  // uppers & pegged
  const [base_upper, quote_upper] = get_uppers(base, quote, tokens, settings);

  // Bancor V1 Formula
  const in_amount = get_bancor_input(
    base_upper,
    quote_upper,
    asset_to_number(_out)
  );

  return number_to_asset(in_amount, quote_sym);
}

export function get_rate(
  quantity: Asset | string,
  symcode: SymbolCode | string,
  tokens: Tokens,
  settings: Settings
): Asset {
  // params
  const _quantity = new Asset(quantity);
  const quote = new SymbolCode(symcode);
  const quote_sym = tokens[quote.to_string()].balance.symbol;

  // calculations
  const fee = get_fee(_quantity, settings);
  const price = get_price(Asset.minus(_quantity, fee), quote, tokens, settings);
  const rate = number_to_asset(price, quote_sym);

  return rate;
}

export function get_inverse_rate(
  out: Asset | string,
  symcode: SymbolCode | string,
  tokens: Tokens,
  settings: Settings
): Asset {
  const price = get_inverse_price(out, symcode, tokens, settings);
  const fee = get_inverse_fee(price, settings);
  const rate = Asset.plus(price, fee);

  return rate;
}

export async function get_settings(
  rpc: JsonRpc,
  code: string
): Promise<Settings> {
  // optional params
  const scope = code;
  const table = "settings";
  const results = await rpc.get_table_rows({
    json: true,
    code,
    scope,
    table,
    limit: 1
  });

  if (!results.rows.length)
    throw new Error(
      "contract is unavailable or currently disabled for maintenance"
    );

//  console.log(results.rows[0]);

  return {
    fee: results.rows[0].fee,
    amplifier: results.rows[0].amplifier,
    proxy_contract: new Name(results.rows[0].proxy_contract),
    proxy_token: new Sym(results.rows[0].proxy_token),
    maker_token: new Sym(results.rows[0].maker_token)
  };
}

export async function get_xchain_settings(
  rpc: JsonRpc,
  code: string
): Promise<XchainSettings> {
  // optional params
  const scope = code;
  const table = "settings";
  const results = await rpc.get_table_rows({
    json: true,
    code,
    scope,
    table,
    limit: 1
  });

  if (!results.rows.length)
    throw new Error(
      "contract is unavailable or currently disabled for maintenance"
    );

//  console.log(results.rows[0]);

  return {
    chain: results.rows[0].current_chain_name,
    enabled: results.rows[0].enabled,
    fee: results.rows[0].fees_percentage
  };
}

export function get_slippage(
  quantity: Asset | string,
  symcode: SymbolCode | string,
  tokens: Tokens,
  settings: Settings
): number {
  const _quantity = new Asset(quantity);

  // calculate current price
  const price = get_price(_quantity, symcode, tokens, settings);

  // calculate price using 1 as unit
  const spot_price =
    1.0 / get_spot_price(_quantity.symbol.code(), symcode, tokens, settings);
  const spot_price_per_unit = spot_price * asset_to_number(_quantity);

  return spot_price_per_unit / price - 1;
}

export function get_pool_balance(tokens: Tokens, settings: Settings) {
  const proxy_token = settings.proxy_token.code();
  let a = 0.0;
//  for (const token in tokens) {
//    if (!is_maker_token(tokens[token].sym.code(), tokens)) {
//      a +=
//        asset_to_number(tokens[token].maker_pool) *
//        get_spot_price(proxy_token, tokens[token].sym.code(), tokens, settings);
//    }
//  }
  return a;
}

export function get_maker_balance(tokens: Tokens, settings: Settings) {
  return asset_to_number(
    tokens[settings.maker_token.code().to_string()].balance
  );
}

export function is_maker_token(quote: SymbolCode, tokens: Tokens): boolean {
//  return tokens[quote.to_string()].token_type.to_string() == "liquidity";
  return false;
}

export function get_maker_spot_price(
  base: SymbolCode,
  tokens: Tokens,
  settings: Settings
): number {
  const proxy_spot_price = get_spot_price(
    base,
    settings.proxy_token.code().to_string(),
    tokens,
    settings
  );
  const pool_balance = get_pool_balance(tokens, settings);
  const maker_balance = get_maker_balance(tokens, settings);
  const maker_spot_price =
    maker_balance > 0 ? (proxy_spot_price * pool_balance) / maker_balance : 1.0;
  return (proxy_spot_price * pool_balance) / maker_balance;
}

export function get_spot_price(
  base: SymbolCode | string,
  quote: SymbolCode | string,
  tokens: Tokens,
  settings: Settings
): number {
  if (is_maker_token(new SymbolCode(quote), tokens))
    return get_maker_spot_price(new SymbolCode(base), tokens, settings);
  const [base_upper, quote_upper] = get_uppers(
    new SymbolCode(base),
    new SymbolCode(quote),
    tokens,
    settings
  );
  return base_upper / quote_upper;
}

export async function get_tokens(
  rpc: JsonRpc,
  code: string,
  limit = 50
): Promise<Tokens> {
  const tokens: Tokens = {};
/*
  // optional params
  const scope = code;
  const table = "tokens";

  const results2 = await rpc.get_table_rows({
    json: true,
    code,
    scope,
    table,
    limit
  });
*/
  const results = {
    more: false,
    rows: [
//      {sym: "8,BTC", contract: "tokens.swaps", balance: "0.00000000 BTC", depth: "1.00000000 BTC", reserve: "1.00000000 BTC", maker_pool: "1.00000000 BTC", token_type: "token", enabled: 1},
      {sym: "4,EOS", contract: "tokens.swaps", balance: "0.0000 EOS", depth: "1.0000 EOS", reserve: "1.0000 EOS", maker_pool: "1.0000 EOS", token_type: "token", enabled: 1},
      {sym: "10,BNT", contract: "tokens.swaps", balance: "0.0000000000 BNT", depth: "1.0000000000 BNT", reserve: "1.0000000000 BNT", maker_pool: "1.0000000000 BNT", token_type: "token", enabled: 1},
      {sym: "4,USDT", contract: "tokens.swaps", balance: "0.0000 USDT", depth: "1.0000 USDT", reserve: "1.0000 USDT", maker_pool: "1.0000 USDT", token_type: "token", enabled: 1},
      {sym: "4,VIGOR", contract: "tokens.swaps", balance: "0.0000 VIGOR", depth: "1.0000 VIGOR", reserve: "1.0000 VIGOR", maker_pool: "1.0000 VIGOR", token_type: "token", enabled: 1},
      {sym: "9,EOSDT", contract: "tokens.swaps", balance: "0.000000000 EOSDT", depth: "1.000000000 EOSDT", reserve: "1.000000000 EOSDT", maker_pool: "1.000000000 EOSDT", token_type: "token", enabled: 1},
    ]
  };

/*
token_info do_issue min_quantity remote_chain remote_token enabled
1	{ "sym": "8,BTC", "contract": "tokens.swaps" }	1	0.00010000 BTC	eos	{ "sym": "8,PBTC", "contract": "btc.ptokens" }	1
2	{ "sym": "4,EOS", "contract": "tokens.swaps" }	1	0.2500 EOS	eos	{ "sym": "4,EOS", "contract": "eosio.token" }	1
3	{ "sym": "10,BNT", "contract": "tokens.swaps" }	1	0.2500000000 BNT	eos	{ "sym": "10,BNT", "contract": "bntbntbntbnt" }	1
4	{ "sym": "4,USDT", "contract": "tokens.swaps" }	1	1.0000 USDT	eos	{ "sym": "4,USDT", "contract": "tethertether" }	1
5	{ "sym": "4,VIGOR", "contract": "tokens.swaps" }	1	1.0000 VIGOR	eos	{ "sym": "4,VIGOR", "contract": "vigortoken11" }	1
6	{ "sym": "9,EOSDT", "contract": "tokens.swaps" }	1	1.000000000 EOSDT	eos	{ "sym": "9,EOSDT", "contract": "eosdtsttoken" }	1

rows: Array(4)
0:
balance: "730.1138 USDT"
contract: "tokens.swaps"
depth: "500.0000 USDT"
enabled: 1
maker_pool: "495.1188 USDT"
reserve: "730.1138 USDT"
sym: "4,USDT"
token_type: "token"
 */

//  console.log("Result structure", results);
  for (const row of results.rows) {
//    console.log("Result structure - row", row);
    const [precision, symcode] = row.sym.split(",");
//    const precision = +precision_str;
    tokens[symcode] = {
      sym: new Sym(symcode, +precision),
      contract: new Name(row.contract),
      balance: new Asset(row.balance),
      depth: new Asset(row.depth),
      reserve: new Asset(row.reserve)
//      maker_pool: new Asset(row.maker_pool),
//      token_type: new Name(row.token_type)
    };
  }
  return tokens;
}

export async function get_romote_tokens(
  rpc: JsonRpc,
  code: string,
  limit = 50
): Promise<Tokens> {
  const tokens: Tokens = {};
  const results = {
    more: false,
    rows: [
//      {sym: "8,PBTC", contract: "btc.ptokens", balance: "0.00000000 PBTC", depth: "1.00000000 PBTC", reserve: "1.00000000 PBTC", maker_pool: "1.00000000 PBTC", token_type: "token", enabled: 1},
      {sym: "4,EOS", contract: "eosio.token", balance: "0.0000 EOS", depth: "1.0000 EOS", reserve: "1.0000 EOS", maker_pool: "1.0000 EOS", token_type: "token", enabled: 1},
      {sym: "10,BNT", contract: "bntbntbntbnt", balance: "0.0000000000 BNT", depth: "1.0000000000 BNT", reserve: "1.0000000000 BNT", maker_pool: "1.0000000000 BNT", token_type: "token", enabled: 1},
      {sym: "4,USDT", contract: "tethertether", balance: "0.0000 USDT", depth: "1.0000 USDT", reserve: "1.0000 USDT", maker_pool: "1.0000 USDT", token_type: "token", enabled: 1},
      {sym: "4,VIGOR", contract: "vigortoken11", balance: "0.0000 VIGOR", depth: "1.0000 VIGOR", reserve: "1.0000 VIGOR", maker_pool: "1.0000 VIGOR", token_type: "token", enabled: 1},
      {sym: "9,EOSDT", contract: "eosdtsttoken", balance: "0.000000000 EOSDT", depth: "1.000000000 EOSDT", reserve: "1.000000000 EOSDT", maker_pool: "1.000000000 EOSDT", token_type: "token", enabled: 1},
    ]
  };

//  console.log("Result structure", results);
  for (const row of results.rows) {
//    console.log("Result structure - row", row);
    const [precision, symcode] = row.sym.split(",");
//    const precision = +precision_str;
    tokens[symcode] = {
      sym: new Sym(symcode, +precision),
      contract: new Name(row.contract),
      balance: new Asset(row.balance),
      depth: new Asset(row.depth),
      reserve: new Asset(row.reserve)
//      maker_pool: new Asset(row.maker_pool),
//      token_type: new Name(row.token_type)
    };
  }
  return tokens;
}

export async function get_xchain_tokens(
  rpc: JsonRpc,
  code: string,
  limit = 50
): Promise<XchainTokens> {
  const tokens: XchainTokens = {};
  //  const remote_tokens: XchainTokens = {};

  // optional params
  const scope = code;
  const table = "tokens";

  const results = await rpc.get_table_rows({
    json: true,
    code,
    scope,
    table,
    limit
  });
//  console.log("get_xchain_tokens:", results);

  for (const row of results.rows) {
//    console.log("get_xchain_tokens.row", row);
    const [precision, symcode] = row.token_info.sym.split(",");
    tokens[symcode] = {
      chain: "telos",
      contract: new Name(row.token_info.contract),
      sym: new Sym(symcode, precision),
      min_quantity: new Asset(row.min_quantity),
      balance: new Asset(row.min_quantity),
      depth: new Asset(row.min_quantity),
      reserve: new Asset(row.min_quantity)
    };
//    console.log("get_xchain_tokens.tokens[", symcode, "]", tokens[symcode].contract.to_string(), tokens[symcode].sym.toString());
  }

  return tokens;
}

export async function get_xchain_remote_tokens(
  rpc: JsonRpc,
  code: string,
  limit = 50
): Promise<XchainTokens> {
  const tokens: XchainTokens = {};

  // optional params
  const scope = code;
  const table = "tokens";

  const results = await rpc.get_table_rows({
    json: true,
    code,
    scope,
    table,
    limit
  });
//  console.log("get_xchain_remote_tokens:", results);

  for (const row of results.rows) {
//    console.log("get_xchain_remote_tokens.row", row);
    const [precision, symcode] = row.remote_token.sym.split(",");
    tokens[symcode] = {
      chain: row.remote_chain,
      contract: new Name(row.remote_token.contract),
      sym: new Sym(symcode, precision),
      min_quantity: new Asset(row.min_quantity),
      balance: new Asset(row.min_quantity),
      depth: new Asset(row.min_quantity),
      reserve: new Asset(row.min_quantity)
    };
//    console.log("get_xchain_remote_tokens.tokens[", symcode, "]", tokens[symcode].contract.to_string(), tokens[symcode].sym.toString());
  }

  return tokens;
}

export function get_uppers(
  base: SymbolCode,
  quote: SymbolCode,
  tokens: Tokens,
  settings: Settings | { amplifier: number }
): [number, number] {
  // balances
  const base_balance = asset_to_number(tokens[base.to_string()].balance);
  const quote_balance = asset_to_number(tokens[quote.to_string()].balance);

  // depth
  const base_depth = asset_to_number(tokens[base.to_string()].depth);
  const quote_depth = asset_to_number(tokens[quote.to_string()].depth);

  // ratio
  const base_ratio = base_balance / base_depth;
  const quote_ratio = quote_balance / quote_depth;

  // upper
  const base_upper =
    settings.amplifier * base_depth - base_depth + base_depth * base_ratio;
  const quote_upper =
    settings.amplifier * quote_depth - quote_depth + quote_depth * quote_ratio;

  return [base_upper, quote_upper];
}

function parse_volume(row: any): Volume {
  const volume: kv = {};
  const fees: kv = {};

  // volume
  for (const { key, value } of row.volume) {
    volume[key] = Number(value.split(" ")[0]);
  }
  // fees
  for (const { key, value } of row.fees) {
    fees[key] = Number(value.split(" ")[0]);
  }
  return {
    timestamp: row.timestamp,
    volume,
    fees
  };
}

export async function get_volume(
  rpc: JsonRpc,
  code: string,
  limit = 1
): Promise<Volume[]> {
  // optional params
  const scope = code;
  const table = "volume";

  const volume: Array<{
    timestamp: string;
    volume: kv;
    fees: kv;
  }> = [];

  const results = await rpc.get_table_rows({
    json: true,
    code,
    scope,
    table,
    reverse: true,
    limit
  });
  for (const row of results.rows) {
    volume.push(parse_volume(row));
  }
  return volume;
}

export const VERSION = 2.0;

export interface kv {
  [symcode: string]: number;
}

export interface Settings {
  fee: number;
  amplifier: number;
  proxy_contract: Name;
  proxy_token: Sym;
  maker_token: Sym;
}

export interface XchainSettings {
  chain: string;
  enabled: boolean;
  fee: number;
}

export interface Tokens {
  [symcode: string]: Token;
}

export interface Token {
  sym: Sym;
  contract: Name;
  balance: Asset;
  depth: Asset;
  reserve: Asset;
//  maker_pool: Asset;
//  token_type: Name;
}

export interface XchainTokens {
  [symcode: string]: XchainToken;
}

export interface XchainToken {
  chain: string;
  contract: Name;
  sym: Sym;
  min_quantity: Asset;
  balance: Asset;
  depth: Asset;
  reserve: Asset;
}

export interface Volume {
  timestamp: string;
  volume: kv;
  fees: kv;
}
