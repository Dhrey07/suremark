import "./load-env";

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { decodeAndVerifyCuis, issueCuisCredential } from "../src/lib/cuis";

const base = { manufacturerId: randomUUID(), productId: randomUUID(), batchId: randomUUID() };

for (const quantity of [100, 10_000, 100_000]) {
  const seen = new Set<string>();
  const started = performance.now();
  let sample = "";
  for (let index = 0; index < quantity; index++) {
    const credential = issueCuisCredential({ type: "unit", ...base });
    seen.add(credential.randomIdentity.toString("hex"));
    if (index === 0) sample = credential.payload;
  }
  const elapsedMs = performance.now() - started;
  if (seen.size !== quantity) throw new Error(`Random identity collision in ${quantity.toLocaleString()} credential sample`);
  if (!decodeAndVerifyCuis(sample, "unit").ok) throw new Error("Sample CUIS credential did not verify");
  console.log(JSON.stringify({ quantity, elapsedMs: Number(elapsedMs.toFixed(2)), credentialsPerSecond: Math.round(quantity / (elapsedMs / 1000)), uniqueRandomIdentities: seen.size }));
}
