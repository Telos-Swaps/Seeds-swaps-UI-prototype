<template>
  <b-navbar class="navBar" toggleable="md" type="dark" variant="dark">
    <b-navbar-brand>
      <router-link :to="{ name: 'Tokens' }">
        <img
          src="@/assets/media/logos/SEEDS-logo.svg"
          height="30px"
          class="mr-4"
        />
      </router-link>
    </b-navbar-brand>

    <b-navbar-toggle target="navbar-toggle-collapse" />

    <b-collapse id="navbar-toggle-collapse" is-nav>
      <b-navbar-nav class="big" :fill="false">
        <div class="networks">
          <b-form-radio-group
            size="sm"
            :checked="selected"
            @input="loadNewModule"
            :options="options"
            button-variant="branded"
            buttons
          />
        </div>
        <div class="features">
          <b-btn
            class="mr-1"
            v-for="navItem in navItems"
            :key="navItem.label"
            :to="navItem.destination"
            :disabled="navItem.disabled"
            :active="navItem.active"
            variant="primary"
            size="sm"
            exact
          >
            <font-awesome-icon :icon="navItem.icon" class="mr-1" fixed-width />
            {{ navItem.label }}
          </b-btn>
        </div>
        <div class="spacer"></div>
      </b-navbar-nav>

      <b-navbar-nav class="ml-auto login">
        <b-btn
          @click="loginAction"
          variant="dual"
          size="sm"
          v-b-tooltip.hover
          :title="loginTooltip"
        >
          {{ loginButtonLabel }}
          <font-awesome-icon :icon="icon" :pulse="spin" fixed-width />
        </b-btn>
      </b-navbar-nav>
    </b-collapse>
  </b-navbar>
</template>

<script lang="ts">
import { Component, Vue, Watch } from "vue-property-decorator";
import { vxm } from "@/store/";
import {
  buildTokenId,
  compareString,
  Feature,
  findOrThrow,
  services
} from "@/api/helpers";
import { ModuleParam } from "../../types/bancor";
import { Route } from "vue-router";

const defaultPaths = [
  {
    moduleId: "tlos",
    base: buildTokenId({ contract: "token.seeds", symbol: "SEEDS" }),
    quote: buildTokenId({ contract: "tokens.hypha", symbol: "HYPHA" })
  }
];
const appendBaseQuoteQuery = (base: string, quote: string, route: Route) => ({
  name: route.name,
  params: route.params,
  query: { base, quote }
});
const extendRouter = (moduleId: string) => {
  const path = findOrThrow(
    defaultPaths,
    path => compareString(moduleId, path.moduleId),
    `failed to find default path for unknown service: ${moduleId}`
  );
  return {
    query: {
      base: path.base,
      quote: path.quote
    },
    params: {
      service: moduleId
    }
  };
};

const extendXtransferRouter = (moduleId: string) => {
  return {
    params: {
      service: moduleId
    }
  };
};
const addDefaultQueryParams = (to: Route): any => {
  const path = findOrThrow(
    defaultPaths,
    path => compareString(to.params.service, path.moduleId),
    `failed to find default path for unknown service`
  );
  return appendBaseQuoteQuery(path.base, path.quote, to);
};
const defaultModuleParams = (moduleId: string): ModuleParam => {
  const path = findOrThrow(
    defaultPaths,
    path => compareString(moduleId, path.moduleId),
    `failed to find default path for unknown service: ${moduleId}`
  );
  return {
    tradeQuery: {
      base: path.base,
      quote: path.quote
    }
  };
};

const createDirectRoute = (name: string, params?: any) => ({
  name,
  ...(params && { params })
});
@Component
export default class Navigation extends Vue {
  get selectedNetwork() {
    return vxm.bancor.currentNetwork;
  }
  get selectedWallet() {
    return vxm.wallet.currentWallet;
  }
  get selected() {
    return this.selectedNetwork;
  }
  get navItems() {
    return [
      {
        label: "Convert",
        destination: createDirectRoute("Tokens"),
        render: this.selectedService!.features.includes(Feature.Trade),
        disabled: false,
        icon: "exchange-alt",
        active: this.$route.name == "Tokens"
      },
      {
        label: "Pools",
        destination: createDirectRoute("Relays"),
        render: this.selectedService!.features.includes(Feature.Liquidity),
        disabled: false,
        icon: "swimming-pool",
        active: this.$route.name == "Relay" || this.$route.name == "Relays"
      },
      ...[
        this.selectedService!.features.includes(Feature.Wallet)
          ? {
              label: "Wallet",
              destination: createDirectRoute("WalletAccount", {
                account: this.isAuthenticated
              }),
              icon: "wallet",
              active: this.$route.name == "Wallet",
              disabled: false,
              render: true
            }
          : []
      ]
      // @ts-ignore
    ].filter(route => route.render);
  }
  set selected(newSelection: string) {
    this.loadNewModule(newSelection);
  }
  async loadNewModule(moduleId: string) {
    const module = findOrThrow(vxm.bancor.modules, module =>
      compareString(module.id, moduleId)
    );
    const moduleAlreadyLoaded = module.loaded;
    await vxm.bancor.initialiseModule({
      moduleId,
      resolveWhenFinished: !moduleAlreadyLoaded,
      //      params: defaultModuleParams(moduleId)
      params: moduleId === "xchain" ? {} : defaultModuleParams(moduleId)
    });

    this.$router.push({ name: "Tokens", ...extendRouter(moduleId) });
    //this.$router.push({ name: "Tokens", ...extendRouter(moduleId) });
  }
  get options() {
    return vxm.bancor.modules.map(module => ({
      text: module.label,
      value: module.id,
      disabled: module.loading
    }));
  }
  get selectedService() {
    return services.find(service => service.namespace == this.selectedNetwork);
  }
  created() {
    false;
    //    vxm.ethWallet.checkAlreadySignedIn();
  }
  @Watch("isAuthenticated")
  onAuthentication(account: string) {
    if (account) {
      vxm.bancor.refreshBalances();
    }
  }
  get language() {
    return vxm.general.language;
  }
  get loginTooltip() {
    return "";
  }
  set language(lang: string) {
    vxm.general.setLanguage(lang);
  }
  get loginStatus() {
    return vxm.tlosWallet.loginStatus;
  }
  get shortenedEthAddress() {
    return false;
  }
  get loginButtonLabel() {
    //    if (this.selectedWallet == "tlos") {
    return this.loginStatus[0];
    //    }
  }
  get icon() {
    //    if (this.selectedWallet == "tlos") {
    return this.loginStatus[1];
    //    }
  }
  get spin() {
    return this.loginStatus[2];
  }
  get isAuthenticated() {
    return vxm.wallet.isAuthenticated;
  }
  createRelay() {
    this.$router.push({
      name: "Create"
    });
  }
  async loginActionEos() {
    const status = this.loginButtonLabel;
    if (status === "Login") {
      this.$bvModal.show("modal-login");
    } else if (
      status !== "Authenticating" &&
      status !== "Connecting" &&
      status !== "Fetching"
    ) {
      vxm.tlosWallet.logout();
    }
  }
  async loginActionEth() {}

  async loginAction() {
    const wallet = this.selectedWallet;
    if (wallet == "tlos") this.loginActionEos();
    else this.loginActionEth();
  }
}
</script>

<style>
.navItem {
  margin: 2px 2px;
}
#form-group {
  margin-bottom: unset;
}
.btn-branded {
  color: grey !important;
  background-color: #1b262e !important;
}
.btn-branded:hover {
  color: black !important;
  background-color: #fa932b !important;
}
.login {
  min-width: 150px;
}
@media (max-width: 768px) {
  .networks {
    margin-top: 15px;
    margin-bottom: 15px;
  }
  .login {
    margin-top: 15px;
  }
}
.features {
  flex-grow: 2;
  flex-basis: auto;
  display: flex;
  justify-content: center;
}
.spacer {
  display: hidden;
  flex-grow: 1;
}
.networks {
  flex-grow: 1;
  flex-basis: auto;
  display: flex;
  justify-content: center;
}
.big {
  width: 100%;
  display: flex;
  justify-content: center;
}
label.active {
  color: black !important;
  background-color: #d18235 !important;
}
</style>
