<template>
    <hero-wrapper>
        <div class="container-xl">
            <b-row>
                <b-col md="4" class="text-center">
                    <token-amount-input
                        :amount.sync="amount"
                        :balance="balance"
                        :img="logo"
                        :symbol="symbol"
                    />
                </b-col>
                <b-col md="4">
                    <b-btn
                        @click="initRedeem"
                        variant="info"
                        :disabled="!isAuthenticated"
                        v-ripple
                        class="px-4 py-2 d-block"
                    >
                        <font-awesome-icon
                            icon="long-arrow-alt-right"
                            fixed-width
                            class="mr-2"
                        />
                        <span class="font-w700">REDEEM</span>
                    </b-btn>
                </b-col>
                <b-col md="4">
                    <div>
                        <div class="font-size-lg text-white">Recipient</div>
                        <b-form-input
                            v-model="recipient"
                            class="form-control-alt mt-2"
                            placeholder="your address"
                        ></b-form-input>
                        <b-button>
                            BTC
                            <font-awesome-icon icon="angle-down" />
                        </b-button>
                    </div>
                </b-col>
            </b-row>
        </div>
    </hero-wrapper>
</template>

<script>
import { Vue, Component } from "vue-property-decorator";
import { vxm } from "@/store";
import HeroWrapper from "@/components/hero/HeroWrapper.vue";
import TokenAmountInput from "@/components/convert/TokenAmountInput.vue";

@Component({
    components: {
        HeroWrapper,
        TokenAmountInput
    }
})
export default class HeroRedeem extends Vue {
    balance = 1;
    amount = "";
    symbol = "HUSD";
    logo = "";
    recipient = "";

    get isAuthenticated() {
        return vxm.tlosWallet.isAuthenticated;
    }

  async initRedeem() {
    await vxm.tlosNetwork.redeem();
  }
}
</script>