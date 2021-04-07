<template>
  <div>
    <div class="container-xl">
      <div class="block">
        <div class="block-header"><h3 class="block-title">Redeem HUSD</h3></div>

        <div class="block-content">
          <div class="table-responsive">
            <b-table
              id="tokens-tablee"
              stripped
              :fields="fields"
              :items="coins"
              primary-key="symbol"
            >
              <template v-slot:cell(index)="data">
                {{ data.index + 1 }}
              </template>

              <template v-slot:cell(name)="data">
                {{ data.name }}
              </template>

              <template v-slot:cell(actions)="data">
                <span>
                  <b-btn
                    @click="initRedeem(data.item.id)"
                    size="md"
                    variant="info"
                    ><font-awesome-icon icon="save"
                  /></b-btn>
                </span>
              </template>
            </b-table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { Vue } from "vue-property-decorator";

export default class Redeem extends Vue {
  fields = [
    { idkey: "index", label: "#", class: "index-header" },
    { key: "name", label: "Currency" },
    { key: "actions", label: "Actions", class: ["text-right"] }
  ];

  coins = [
    {
      index: 0,
      name: "Bitcoin"
    }
  ];
}
</script>