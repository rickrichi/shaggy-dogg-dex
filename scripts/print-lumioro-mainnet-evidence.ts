import { getLumioroMainnetEvidenceGateReport } from "../src/lib/amm/lumioro-evidence-gate";

console.log(
  JSON.stringify(
    getLumioroMainnetEvidenceGateReport(),
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  )
);
