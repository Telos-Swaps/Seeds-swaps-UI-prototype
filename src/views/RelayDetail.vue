<template>
  <b-container class="base">
    <b-row align-v="center">
      <b-col>
        <font-awesome-icon
          icon="arrow-left"
          fixed-width
          @click="goBack"
          :style="{ color: 'black' }"
        />
      </b-col>
      <b-col v-if="!loading" class="text-center align-middle">
        <p class="h3">ROI: {{ performanceLabel }}</p>
      </b-col>
      <b-col v-if="!loading" class="justify-content-end d-flex flex-end">
        <b-dropdown size="sm" :text="selectedMode" class="m-md-2">
          <b-dropdown-item
            :active="option.active"
            v-for="option in options"
            :key="option.label"
            @click="changeOption(option.value)"
            >{{ option.label }}</b-dropdown-item
          >
        </b-dropdown>
      </b-col>
    </b-row>

    <b-row>
      <div :class="classes">
        <b-spinner
          v-if="loading"
          style="display: block; width: 10rem; height: 10rem;"
          class="text-dark"
          label="Loading..."
        ></b-spinner>
        <div v-else>
          <highcharts
            :constructor-type="'stockChart'"
            :options="chartOptions"
          />
        </div>
      </div>
    </b-row>
  </b-container>
</template>

<script lang="ts">
import { Component, Vue, Watch } from "vue-property-decorator";
import { vxm } from "@/store";
import wait from "waait";
import { Chart } from "highcharts-vue";

import Highcharts, { getOptions, AxisSetExtremesEventObject } from "highcharts";
import stockInit from "highcharts/modules/stock";
import { compareString, findOrThrow } from "../api/helpers";
import { sortByNetworkTokens } from "../api/sortByNetworkTokens";

stockInit(Highcharts);

enum YieldType {
  portfolio = "Both",
  token = "Token",
  network = "Network"
}

@Component({
  components: {
    highcharts: Chart
  }
})
export default class RelayDetail extends Vue {
  loading = true;
  performance = {
    Token: 0,
    Both: 0,
    Network: 0
  };
  type: YieldType = YieldType.portfolio;

  chartOptions = {};

  changeOption(newType: YieldType) {
    this.type = newType;
  }

  get performanceNumber() {
    return (
      (this.performance[this.type] > 1 ? "+" : "") +
      ((this.performance[this.type] - 1) * 100).toFixed(2)
    );
  }

  get performanceLabel() {
    return `${this.performanceNumber} %`;
  }

  getTokenType(label: string) {
    switch (label) {
      case YieldType.token:
        return "Hodl " + this.token.symbol;
      case YieldType.network:
        return "Hodl " + this.network.symbol;
      case YieldType.portfolio:
        return "Hodl 50/50";
    }
  }

  get options() {
    return Object.values(YieldType).map(x => ({
      label: this.getTokenType(x),
      value: x,
      active: this.type == x
    }));
  }

  get selectedMode() {
    return this.getTokenType(this.type);
  }

  get relay() {
    return findOrThrow(vxm.bancor.relays, (relay: any) =>
      compareString(relay.id, this.focusedId)
    );
  }

  get token() {
    return this.sortedReserves[1];
  }

  get network() {
    return this.sortedReserves[0];
  }

  get sortedReserves() {
    return sortByNetworkTokens(this.reserves, (reserve: any) => reserve.symbol);
  }

  get reserves() {
    return this.relay.reserves;
  }

  get focusedId() {
    return this.$router.currentRoute.params.account;
  }

  get classes() {
    return [
      "block-content",
      "px-0",
      "px-md-3",
      "main",
      ...(this.loading ? ["d-flex", "justify-content-center"] : [])
    ];
  }

  goBack() {
    this.$router.push({
      name: "Relay",
      params: { account: this.focusedId }
    });
  }
}
</script>

<style lang="scss">
.base {
  padding: 10px;
  background-color: white;
}
</style>
