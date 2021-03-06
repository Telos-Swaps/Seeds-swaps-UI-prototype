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
import { fetchUsdPriceOfSeeds } from "@/api/helpers";
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
    label: "",
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
  usdPriceOfSeeds: TlosPrice = {
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
    this.moduleInitalising(moduleId);
    if (resolveWhenFinished) {
      try {
        await this.$store.dispatch(`${moduleId}Bancor/init`, params || null, {
          root: true
        });
        this.moduleInitialised(moduleId);
      } catch (e) {
        this.moduleThrown(moduleId);
      }
    } else {
      try {
        this.$store
          .dispatch(`${moduleId}Bancor/init`, params || null, {
            root: true
          })
          .then(() => this.moduleInitialised(moduleId));
      } catch (e) {
        this.moduleThrown(moduleId);
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

      const res = await any([fetchUsdPriceOfSeeds()]);
      const usdPrice = res as number;

      this.setUsdPriceOfSeeds({
        price: usdPrice,
        lastChecked: new Date().getTime()
      });
      return usdPrice;
    } catch (e) {
      throw new Error(
        `Failed to find USD Price of TLOS from External API & Relay ${e.message}`
      );
    }
  }

  @action async fetchusdPriceOfSeeds() {
    const timeNow = new Date().getTime();
    const millisecondGap = 900000;
    const makeNetworkRequest =
      !this.usdPriceOfSeeds.lastChecked ||
      this.usdPriceOfSeeds.lastChecked + millisecondGap < timeNow;
    return makeNetworkRequest
      ? this.getUsdPrice()
      : (this.usdPriceOfSeeds.price as number);
  }

  @mutation setUsdPriceOfSeeds(usdPriceOfSeeds: TlosPrice) {
    this.usdPriceOfSeeds = usdPriceOfSeeds;
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
