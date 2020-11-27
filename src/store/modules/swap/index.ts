import { createModule, action, mutation } from "vuex-class-component";
import {
  ProposedConvertTransaction,
  LiquidityParams,
  OpposingLiquidParams,
  ModalChoice,
  NetworkChoice,
  FeeParams,
  NewOwnerParams,
  HistoryRow,
  ProposedToTransaction,
  ProposedFromTransaction,
  ModuleParam
} from "@/types/bancor";
import { vxm } from "@/store";
import { store } from "../../../store";
import { compareString, updateArray } from "@/api/helpers";
import {
  fetchNewdexEosPriceOfTlos,
  fetchCoinGechoUsdPriceOfEos
} from "@/api/helpers";
import { defaultModule } from "@/router";

interface TlosPrice {
  price: null | number;
  lastChecked: number;
}

interface Tlos24hPriceMove {
  percent_change_24h: null | number;
  lastChecked: number;
}

const VuexModule = createModule({
  strict: false
});

interface RootParam {
  initialModuleParam?: ModuleParam;
  initialChain?: string;
}

const moduleIds: { label: string; id: string }[] = [
  {
    label: "Telos Swaps",
    id: "tlos"
  }
];

interface Module {
  id: string;
  label: string;
  loading: boolean;
  loaded: boolean;
  error: boolean;
}

export class BancorModule extends VuexModule.With({
  namespaced: "bancor/"
}) {
  usdPriceOfTlos: TlosPrice = {
    price: null,
    lastChecked: 0
  };

  usdTlos24hPriceMove: Tlos24hPriceMove = {
    percent_change_24h: null,
    lastChecked: 0
  };

  modules: Module[] = moduleIds.map(({ id, label }) => ({
    id,
    label,
    loading: false,
    loaded: false,
    error: false
  }));

  get currentNetwork() {
    // @ts-ignore
    if (
      // @ts-ignore
      store.state.routeModule &&
      // @ts-ignore
      store.state.routeModule.params &&
      // @ts-ignore
      store.state.routeModule.params.service
    ) {
      // @ts-ignore
      return store.state.routeModule.params.service;
    } else {
      return defaultModule;
    }
  }

  get tokens() {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["tokens"];
  }

  get supportedFeatures() {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["supportedFeatures"];
  }

  get token() {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["token"];
  }

  get relays() {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["relays"];
  }

  get convertibleTokens() {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["convertibleTokens"];
  }

  get moreTokensAvailable() {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["moreTokensAvailable"];
  }

  get newPoolTokenChoices(): (networkTokenSymbol: string) => ModalChoice[] {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["newPoolTokenChoices"];
  }

  get newNetworkTokenChoices(): NetworkChoice[] {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["newNetworkTokenChoices"];
  }

  get relay() {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["relay"];
  }

  get morePoolsAvailable() {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["morePoolsAvailable"];
  }

  get loadingPools() {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["loadingPools"];
  }

  get wallet() {
    // @ts-ignore
    return vxm[`${this.currentNetwork}Bancor`]["wallet"];
  }

  @mutation updateModule({
    id,
    updater
  }: {
    id: string;
    updater: (module: Module) => Module;
  }) {
    const newModules = updateArray(
      this.modules,
      module => compareString(id, module.id),
      updater
    );
    this.modules = newModules;
  }

  @action async moduleInitialised(id: string) {
    this.updateModule({
      id,
      updater: module => ({
        ...module,
        loaded: true,
        loading: false,
        error: false
      })
    });
  }

  @action async moduleThrown(id: string) {
    this.updateModule({
      id,
      updater: module => ({
        ...module,
        loaded: false,
        loading: false,
        error: true
      })
    });
  }

  @action async moduleInitalising(id: string) {
    this.updateModule({
      id,
      updater: module => ({ ...module, loading: true })
    });
  }

  @action async initialiseModule({
    moduleId,
    params,
    resolveWhenFinished = false
  }: {
    moduleId: string;
    params?: ModuleParam;
    resolveWhenFinished: boolean;
  }) {
    await this.moduleInitalising(moduleId);
    if (resolveWhenFinished) {
      try {
        await this.$store.dispatch(`${moduleId}Bancor/init`, params || null, {
          root: true
        });
        await this.moduleInitialised(moduleId);
      } catch (e) {
        await this.moduleThrown(moduleId);
      }
    } else {
      try {
        this.$store
          .dispatch(`${moduleId}Bancor/init`, params || null, {
            root: true
          })
          .then(() => this.moduleInitialised(moduleId));
      } catch (e) {
        await this.moduleThrown(moduleId);
      }
    }
  }

  @action async init(param?: RootParam) {
    if (param && param.initialChain && param.initialModuleParam) {
      return this.initialiseModule({
        moduleId: param.initialChain,
        params: param.initialModuleParam,
        resolveWhenFinished: true
      });
    } else {
      return Promise.all(
        this.modules
          .map(module => module.id)
          .map(moduleId =>
            this.initialiseModule({ moduleId, resolveWhenFinished: true })
          )
      );
    }
  }

  @action async getUsdPrice() {
    try {
      const reverse = (promise: any) =>
        new Promise((resolve, reject) =>
          Promise.resolve(promise).then(reject, resolve)
        );
      const any = (arr: any[]) => reverse(Promise.all(arr.map(reverse)));
      // TODO : Migrate price feed to Newdex
      const res1 = await any([fetchNewdexEosPriceOfTlos()]);
      const res2 = await any([fetchCoinGechoUsdPriceOfEos()]);

      // @ts-ignore
      const p1 = res1.price != null ? res1.price as number : 0.0;
      // @ts-ignore
      const usd24hPriceMove = res1.percent_change_24h != null ? res1.percent_change_24h as number : 0.0;
      // @ts-ignore
      const p2 = res2 != null ? res2 as number : 0.0;
      const usdPrice = p1 * p2;

//      console.log("getUsdPrice",p1,p2,usdPrice);

      // TODO : this syntax is really bad, not sure how to do it properly
//      const res = await any([fetchCmcUsdPriceOfTlos()]);
//      console.log("getUsdPrice.fetchCoinCmcUsdPriceOfTlos", res);
//      // @ts-ignore
//      const usdPrice = res.price != null ? res.price as number : 0.0;
//      // @ts-ignore
//      const usd24hPriceMove = res.percent_change_24h != null ? res.percent_change_24h as number : 0.0;
//      console.log("getUsdPrice.fetchCoinCmcUsdPriceOfTlos", usdPrice, usd24hPriceMove);
      // TODO rolled back CMC price because of slow respones
//      const res = await any([fetchCoinGechoUsdPriceOfTlos()]);
//      const usdPrice = res as number;
//      const usd24hPriceMove = 0.0;
      this.setUsdPriceOfTlos({
        price: usdPrice,
        lastChecked: new Date().getTime()
      });
      this.setUsdTlos24hPriceMove({
        percent_change_24h: usd24hPriceMove,
        lastChecked: new Date().getTime()
      });
      return usdPrice;
    } catch (e) {
      throw new Error(
        `Failed to find USD Price of TLOS from External API & Relay ${e.message}`
      );
    }
  }

  @action async fetchUsdPriceOfTlos() {
    const timeNow = new Date().getTime();
    const millisecondGap = 900000;
    const makeNetworkRequest =
      !this.usdPriceOfTlos.lastChecked ||
      this.usdPriceOfTlos.lastChecked + millisecondGap < timeNow;
    return makeNetworkRequest
      ? this.getUsdPrice()
      : (this.usdPriceOfTlos.price as number);
  }

  @mutation setUsdPriceOfTlos(usdPriceOfTlos: TlosPrice) {
    this.usdPriceOfTlos = usdPriceOfTlos;
  }

  @action async fetchUsd24hPriceMove() {
    const timeNow = new Date().getTime();
    const millisecondGap = 900000;
    const makeNetworkRequest =
      !this.usdTlos24hPriceMove.lastChecked ||
      this.usdTlos24hPriceMove.lastChecked + millisecondGap < timeNow;
    return makeNetworkRequest
      ? this.getUsdPrice()
      : (this.usdTlos24hPriceMove.percent_change_24h as number);
  }

  @mutation setUsdTlos24hPriceMove(usdTlos24hPriceMove: Tlos24hPriceMove) {
    this.usdTlos24hPriceMove = usdTlos24hPriceMove;
  }

  @action async loadMoreTokens(tokenIds?: string[]) {
    return this.dispatcher(["loadMoreTokens", tokenIds]);
  }

  @action async fetchHistoryData(relayId: string): Promise<HistoryRow[]> {
    return this.dispatcher(["fetchHistoryData", relayId]);
  }

  @action async convert(tx: ProposedConvertTransaction) {
    return this.dispatcher(["convert", tx]);
  }

  @action async updateFee(fee: FeeParams) {
    return this.dispatcher(["updateFee", fee]);
  }

  @action async loadMorePools() {
    return this.dispatcher(["loadMorePools"]);
  }

  @action async removeRelay(symbolName: string) {
    return this.dispatcher(["removeRelay", symbolName]);
  }

  @action async updateOwner(owner: NewOwnerParams) {
    return this.dispatcher(["updateOwner", owner]);
  }

  @action async getUserBalances(symbolName: string) {
    return this.dispatcher(["getUserBalances", symbolName]);
  }

  @action async createPool(newPoolParams: any): Promise<string> {
    return this.dispatcher(["createPool", newPoolParams]);
  }

  @action async getCost(proposedTransaction: ProposedToTransaction) {
    return this.dispatcher(["getCost", proposedTransaction]);
  }

  @action async getReturn(proposedTransaction: ProposedFromTransaction) {
    return this.dispatcher(["getReturn", proposedTransaction]);
  }

  @action async addLiquidity(addLiquidityParams: LiquidityParams) {
    return this.dispatcher(["addLiquidity", addLiquidityParams]);
  }

  @action async removeLiquidity(removeLiquidityParams: LiquidityParams) {
    return this.dispatcher(["removeLiquidity", removeLiquidityParams]);
  }

  @action async calculateOpposingDeposit(
    opposingDeposit: OpposingLiquidParams
  ) {
    return this.dispatcher(["calculateOpposingDeposit", opposingDeposit]);
  }

  @action async calculateOpposingWithdraw(
    opposingWithdraw: OpposingLiquidParams
  ) {
    return this.dispatcher(["calculateOpposingWithdraw", opposingWithdraw]);
  }

  @action async focusSymbol(symbolName: string) {
    return this.dispatcher(["focusSymbol", symbolName]);
  }

  @action async dispatcher([methodName, params]: [string, any?]) {
    return params
      ? this.$store.dispatch(
          `${this.currentNetwork}Bancor/${methodName}`,
          params,
          { root: true }
        )
      : this.$store.dispatch(
          `${this.currentNetwork}Bancor/${methodName}`,
          null,
          { root: true }
        );
  }

  @action async refreshBalances(symbols: string[] = []) {
    if (vxm.wallet.isAuthenticated) {
      return this.dispatcher(["refreshBalances", symbols]);
    }
  }
}
