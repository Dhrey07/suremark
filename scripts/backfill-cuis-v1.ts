import "./load-env";

import { closeDb } from "../src/db";
import { backfillCuisV1 } from "../src/lib/services/cuis-migration";

async function main() {
  const result = await backfillCuisV1();
  console.log(`CUIS v1 backfill complete: ${result.batches} newly signed batches, ${result.cartons} newly signed cartons, ${result.units} newly signed units, ${result.registryCredentials} authenticated credentials registered, ${result.allocations} allocation record(s), ${result.keyVersions} key version(s)`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
