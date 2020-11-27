import Vue from "vue";
import Vuex from "vuex";

import { GeneralModule } from "./modules/general";
import { EosTransitModule } from "./modules/wallet/tlosWallet";
import { TlosBancorModule } from "./modules/swap/tlosBancor";
import { UsdBancorModule } from "./modules/swap/usdSx";
import { BancorModule } from "./modules/swap/index";
import { WalletModule } from "./modules/wallet/index";
import { NetworkModule } from "./modules/network/index";
import { TlosNetworkModule } from "./modules/network/tlosNetwork";
import { createProxy, extractVuexModule } from "vuex-class-component";

Vue.use(Vuex);

export const store = new Vuex.Store({
  modules: {
    ...extractVuexModule(UsdBancorModule),
    ...extractVuexModule(TlosBancorModule),
    ...extractVuexModule(GeneralModule),
    ...extractVuexModule(EosTransitModule),
    ...extractVuexModule(BancorModule),
    ...extractVuexModule(WalletModule),
    ...extractVuexModule(NetworkModule),
    ...extractVuexModule(TlosNetworkModule)
  },
  strict: process.env.NODE_ENV !== "production"
});

export const vxm = {
  general: createProxy(store, GeneralModule),
  wallet: createProxy(store, WalletModule),
  tlosWallet: createProxy(store, EosTransitModule),
  tlosBancor: createProxy(store, TlosBancorModule),
  usdsBancor: createProxy(store, UsdBancorModule),
  bancor: createProxy(store, BancorModule),
  tlosNetwork: createProxy(store, TlosNetworkModule),
  network: createProxy(store, NetworkModule)
};
