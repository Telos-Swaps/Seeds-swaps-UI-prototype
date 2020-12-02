export interface TokenPrice {
  id: string;
  code: string;
  name: string;
  primaryCommunityId: string;
  primaryCommunityImageName: string;
  liquidityDepth: number;
  price: number;
  change24h: number;
  volume24h: Volume24h;
  smartPriceApr: number;
}

export interface Volume24h {
  USD: number;
  EUR: number;
}

export type FloatAmount = number;

export interface RawRow {
  timestamp: string;
  ROI: string;
  "Token Price": string;
  "Trade Volume": string;
}

export interface HistoryRow {
  timestamp: number;
  roi: number;
  tokenPrice: number;
  tradeVolume: number;
}

export interface TokenBalance {
  symbol: string;
  precision: number;
  amount: number;
  contract: string;
}

export interface TokenBalances {
  query_time: number;
  account: string;
  tokens: TokenBalance[];
}

export interface ProposedFromTransaction {
  from: ViewAmount;
  toId: string;
}

export interface ProposedToTransaction {
  to: ViewAmount;
  fromId: string;
}

export interface ViewAmount {
  id: string;
  amount: string;
}

// Add ViewAmount to getting max smart user balances and remove userBalances
// Maybe utilise ViewAmount on Converts as well
// Bonus:
// Utilise ID over symbol more
// TODO

type OnUpdate = (index: number, sections: Section[]) => void;

export interface LiquidityParams {
  id: string;
  reserves: ViewAmount[];
  onUpdate?: OnUpdate;
}

export interface OpposingLiquidParams {
  id: string;
  reserve: ViewAmount;
}

export interface OpposingLiquid {
  opposingAmount: string;
}

export interface Section {
  name: string;
  description: string;
}

export interface ProposedConvertTransaction {
  from: ViewAmount;
  to: ViewAmount;
  onUpdate?: OnUpdate;
}

export interface TokenDetail {
  _id: string;
  type: string;
  code: string;
  lowerCaseCode: string;
  status: string;
  isDiscoverable: boolean;
  createdAt: string;
  isDeleted: boolean;
  primaryCommunityId: string;
  name: string;
  about: string;
  promotionOrder: null;
  textIcon: string;
  adminProfileId: null;
  details: Detail[];
  primaryCommunityImageName: string;
  order: number;
  liquidityDepth: string;
}

export type EthAddress = string;

export interface CoTrade {
  tokenAddress: string;
  symbol: string;
  smartTokenSymbol: string;
  converterAddress: string;
  smartTokenAddress: string;
  owner: string;
  isOfficial: number;
  isCoTraderVerified: number;
  isBlacklisted: number;
  connectorType: string;
  smartTokenSupply: string;
  connectorBancorReserve: string;
  connectorOriginalReserve: string;
  smartTokenInETH: null;
  smartTokenInUSD: null;
  tokenDecimals: number;
  conversionFee: string;
  converterVersion: string;
}

export interface Detail {
  blockchain: Blockchain;
  blockchainId: string;
  type: string;
  stage: string;
  supply: string;
  decimals: number;
  relayCurrencyId: string;
  converter: Converter;
  symbol: string;
}

export interface Blockchain {
  type: string;
  chainId: string;
}

export interface Converter {
  activatedAt: string;
}

export interface ConvertReturn {
  amount: string;
  slippage?: number;
  fee?: string;
}

export interface ViewToken {
  id: string;
  contract: string;
  symbol: string;
  name: string;
  price?: number;
  //  priceTlos?: number;
  liqDepth?: number;
  logo: string;
  change24h?: number;
  volume24h?: number;
  balance?: number;
  precision?: number;
}

interface TokenWithLogo extends AgnosticToken {
  logo: string[];
}

export interface ViewReserve {
  reserveId: string;
  id: string;
  smartTokenSymbol: string;
  logo: string[];
  symbol: string;
  contract: string;
  balance?: number;
}

export interface ViewRelay {
  id: string;
  symbol: string;
  smartTokenSymbol: string;
  liqDepth: number;
  reserves: ViewReserve[];
  fee: number;
  owner: string;
  apr: number; // TODO populate APR
  addLiquiditySupported: boolean;
  removeLiquiditySupported: boolean;
  focusAvailable?: boolean;
}

export interface CallReturn<T = any> {
  call: () => Promise<T>;
}

export interface TokenPriceExtended extends TokenPrice {
  balance: number;
}

export interface TradeQuery {
  base: string;
  quote: string;
}

export type PoolQuery = string;
//export type BridgeQuery = string;

export interface ModuleParam {
  tradeQuery?: TradeQuery;
  poolQuery?: PoolQuery;
  //  bridgeQuery?: BridgeQuery;
}

export interface ViewModalToken {
  id: string;
  symbol: string;
  img: string;
  balance?: number;
}

export interface TradingModule {
  init: (param?: ModuleParam) => Promise<void>;
  readonly token: (arg0: string) => ViewToken;
  readonly tokens: ViewToken[];
  readonly convertibleTokens: ViewModalToken[];
  readonly moreTokensAvailable: boolean;
  readonly loadingTokens: boolean;
  refreshBalances: (symbols?: BaseToken[]) => Promise<void>;
  accountChange: (address: string) => Promise<void>;
  convert: (propose: ProposedConvertTransaction) => Promise<string>;
  focusSymbol: (symbolName: string) => Promise<void>;
  getReturn: (propose: ProposedFromTransaction) => Promise<ConvertReturn>;
  getCost: (propose: ProposedToTransaction) => Promise<ConvertReturn>;
  loadMoreTokens: (tokenIds?: string[]) => Promise<void>;
}

export interface LiquidityModule {
  init: (param: ModuleParam) => Promise<void>;
  readonly relay: (arg0: string) => ViewRelay;
  readonly relays: ViewRelay[];
  readonly supportedFeatures: (arg0: string) => string[];
  readonly morePoolsAvailable: boolean;
  readonly loadingPools: boolean;
  loadMorePools: () => Promise<void>;
  calculateOpposingDeposit: (
    opposingDeposit: OpposingLiquidParams
  ) => Promise<OpposingLiquid>;
  updateFee?: (fee: FeeParams) => Promise<string>;
  updateOwner?: (fee: NewOwnerParams) => Promise<string>;
  calculateOpposingWithdraw: (
    opposingWithdraw: OpposingLiquidParams
  ) => Promise<OpposingLiquid>;
  getUserBalances: (
    relayId: string
  ) => Promise<{
    maxWithdrawals: ViewAmount[];
    smartTokenBalance: string;
  }>;
  removeLiquidity: (params: LiquidityParams) => Promise<string>;
  addLiquidity: (params: LiquidityParams) => Promise<string>;
  removeRelay?: (symbolName: string) => Promise<string>;
}

export interface TokenMeta {
  id: string;
  name: string;
  logo: string;
  logo_lg: string;
  symbol: string;
  account: string;
  chain: string;
}

export interface AgnosticToken {
  id: string;
  contract: string;
  precision: number;
  symbol: string;
  network: string;
  amount: number;
}

export interface EosMultiRelay {
  id: string;
  reserves: AgnosticToken[];
  contract: string;
  owner: string;
  isMultiContract: boolean;
  smartEnabled: boolean;
  smartToken: AgnosticToken;
  fee: number;
  apr: number;
}

export interface ModalChoice {
  id: string;
  symbol: string;
  contract: string;
  balance?: number;
  img: string;
  usdValue?: number;
}

export interface NetworkChoice extends ModalChoice {
  usdValue: number;
}

export interface Step {
  name: string;
  description: string;
}

export interface CreatePoolParams {
  reserves: ViewAmount[];
  fee: number;
  onUpdate: OnUpdate;
}

export interface CreatePoolModule {
  init: (param: ModuleParam) => Promise<void>;
  readonly newPoolTokenChoices: (networkToken: string) => ModalChoice[];
  readonly newNetworkTokenChoices: ModalChoice[];
  createPool: (param: CreatePoolParams) => Promise<string>;
}

export interface HistoryModule {
  fetchHistoryData: (relayId: string) => Promise<any[]>;
}

export interface FeeParams {
  fee: number;
  id: string;
}

export interface NewOwnerParams {
  newOwner: string;
  id: string;
}

export interface BaseToken {
  contract: string;
  symbol: string;
}
export interface PromiseEvent {
  name: string;
  description: string;
  promise: () => Promise<any>;
}

export interface PromiseSequence {
  promises: PromiseEvent[];
  title: string;
}

interface GetBalanceParam {
  tokens: TokenBalanceParam[];
  slow?: boolean;
  disableSetting?: boolean;
}

interface TokenBalanceParam {
  contract: string;
  symbol: string;
  precision?: number;
}

interface TransferParam {
  to: string;
  id: string;
  amount: number;
  memo?: string;
}

export interface TokenBalanceReturn extends TokenBalanceParam {
  balance: number;
}

interface TokenQueries extends TokenBalanceParam {
  balance?: number;
}

export interface NetworkModule {
  readonly networkId: string;
  getBalances: (tokens?: GetBalanceParam) => Promise<TokenBalanceReturn[]>;
}

// Amount in an asset without reference to it's actual precision
// E.g. "10000" will be 1.0000 EOS
export type IntegerAmount = string;

export interface BancorAPIResponseToken {
  id: string;
  code: string;
  name: string;
  primaryCommunityImageName: string;
  liquidityDepth: number;
  decimals: number;
  price: number;
  //  priceTlos: number;
  change24h: number;
  volume24h: Volume24H;
  priceHistory: Array<number[]>;
}

export interface Volume24H {
  USD: number;
  EUR: number;
}

export interface ReserveInstance {
  balance: string;
  ratio: number;
  sale_enabled: boolean;
  contract: string;
}

export interface SimpleToken {
  symbol: string;
  name: string;
  contract: string;
  logo: string;
  precision: number;
}

export interface SimpleTokenWithMarketData extends SimpleToken {
  price: string;
  liqDepth: number;
}

export interface Price {
  rate: number;
  diff: number;
  diff7d: number;
  ts: number;
  marketCapUsd: number;
  availableSupply: number;
  volume24h: number;
  diff30d: number;
}

export interface kv {
  [symcode: string]: number;
}

export interface Settings {
  paused: boolean;
  pool_fee: number;
  transaction_fee: string;
  stability_fee: number;
  min_convert: string;
  min_stake: string;
}

export enum Feature {
  Trade,
  Wallet,
  Liquidity
}

export interface Service {
  namespace: string;
  features: Feature[];
}
