import { DryRelay } from "@/api/eosBancorCalc";
import { Sym } from "eos-common";

const seedsToken = {
  contract: "token.seeds",
  symbol: "4,SEEDS"
};

const oldRelays = [
  {
    contract: "hypha.seedsx",
    smartToken: {
      contract: "relay.seedsx",
      symbol: "8,HYPHAR"
    },
    reserves: [
      {
        contract: "token.hypha",
        symbol: "2,HYPHA"
      },
      seedsToken
    ]
  },
  {
    contract: "husd.seedsx",
    smartToken: {
      contract: "relay.seedsx",
      symbol: "8,HUSDR"
    },
    reserves: [
      {
        contract: "husd.hypha",
        symbol: "2,HUSD"
      },
      seedsToken
    ]
  },
  {
    contract: "tlos.seedsx",
    smartToken: {
      contract: "relay.seedsx",
      symbol: "8,TLOSR"
    },
    reserves: [
      {
        contract: "eosio.token",
        symbol: "4,TLOS"
      },
      seedsToken
    ]
  }
];

export const getHardCodedRelays = (): DryRelay[] =>
  oldRelays.map(relay => ({
    ...relay,
    isMultiContract: false,
    smartToken: {
      contract: relay.smartToken.contract,
      symbol: new Sym(relay.smartToken.symbol)
    },
    reserves: relay.reserves.map(reserve => ({
      ...reserve,
      symbol: new Sym(reserve.symbol)
    }))
  }));
