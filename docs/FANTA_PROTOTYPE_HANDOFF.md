# Fanta prototype handoff

This scenario is stored in the connected Supabase PostgreSQL database. It is not mock UI state.

## Working URLs

- Public verification: <http://localhost:3000/>
- Manufacturer sign-in: <http://localhost:3000/manufacturer/login>
- Platform administration: <http://localhost:3000/platform/login>
- Product catalogue (after sign-in): <http://localhost:3000/app/products>
- Fanta product workspace: <http://localhost:3000/app/products/b4e063f5-cd47-4983-8003-9b00e3362c5d>
- Create a Fanta batch: <http://localhost:3000/app/products/b4e063f5-cd47-4983-8003-9b00e3362c5d/batches/new>
- Two-batch production plan: <http://localhost:3000/app/batches/groups/ece07ed7-6811-4713-863a-4c2d130d93d4>
- Batch 1 carton hierarchy: <http://localhost:3000/app/batches/624b9e25-eb2d-4446-a1a7-9d712c73c139>
- Batch 2 carton hierarchy: <http://localhost:3000/app/batches/e5e89f4e-7d4d-4cea-9d71-6cab41131275>
- Example unit record: <http://localhost:3000/app/units/124f2698-9a0f-4588-b1cf-ce0e3012bdac>

## Prototype accounts

| Responsibility | Email | Password |
|---|---|---|
| Manufacturer owner and catalogue manager | `manufacturer.owner@veriff.local` | `PrototypeOwner2026!` |
| Production manager | `production.manager@veriff.local` | `PrototypeProduction2026!` |
| Factory manager / allocation approver | `factory.manager@veriff.local` | `PrototypeFactory2026!` |
| Line operator | `line.operator@veriff.local` | `PrototypeOperator2026!` |
| QA release officer | `qa.officer@veriff.local` | `PrototypeQuality2026!` |
| Platform administrator | `platform.admin@veriff.local` | `PrototypeAdmin2026!` |

These credentials are for the local prototype only. Change or remove them before any real deployment. The database password is intentionally not included here.

## Stored identifiers and results

- Manufacturer: `Veriff Prototype Manufacturing Ltd`
- Permanent manufacturer prefix: `VRF`
- Factory: `Lagos Bottling Plant`
- Production line: `PET Bottling Line 1`
- Product: `Fanta Orange 50cl`
- Automatic immutable product code: `FT01`
- Packaging version: `1`
- Packaging: `24 bottles per carton`, `50 cartons per pallet`
- Regulatory record: `SIM-NAFDAC-FANTA-001`
- Regulatory outcome: `simulated_match` — explicitly development-only and not an authoritative NAFDAC result
- Batch group: `ece07ed7-6811-4713-863a-4c2d130d93d4`
- Batch 1: `FANTA-261025-RUN-01` — 10 cartons, 240 units, released
- Batch 2: `FANTA-261025-RUN-02` — 10 cartons, 240 units, released
- Total: 20 unique carton identities and 480 unique active unit identities
- Example carton: `VRF-FT01-B1-C001`
- Example valid unit code: `5795 1829 1915 3101`
- Example QR payload: `AQEAAAABAAAAAgAAAAGwJvf36qtMFuMmCKCANBd5s3wN-QtL_4DRUFvandNfLe-R1eH_NcD7BrI8cJ6wznIqd9_L2-2SbJBqgkFUGBQAMo96f3RuFa3K9liH5ofSCQ`
- Public result: `Identity issued — no known alerts`

## Validation evidence

- Supabase migrations through `0006_product_batch_workspace` applied successfully.
- Product details, versioned packaging, batch creation, carton/unit exploration, unit records, and audited exports all read from and write to PostgreSQL.
- Batch totals are enforced as `(cartons × units per carton) + loose units`; the demonstrated default is `10 × 24 + 0 = 240`.
- Unit, carton and batch-summary PDFs are generated from the stored credentials. CSV exports contain the stored unit codes and verification URLs.
- Production build passed with Next.js webpack.
- TypeScript passed with no errors.
- Database-free credential and numeric-code suite: 9/9 passing.
- Connected-database prototype test: 480/480 unique identities, 20/20 cartons with 24 units, 240 rows in the single-batch CSV, and a valid PDF export.
- The full database scenario completed through product review, independent allocation approval, printing, reconciliation and QA release.
- Browser checks passed at 320, 360, 375, 390, 414, 768, 1024, 1280, 1440 and 1920 px with no layout overflow.
- Public verification was exercised repeatedly and remained successful after refresh, with each check recorded in the unit history.
- The full database suite remains isolated from Supabase and requires a local `TEST_DATABASE_URL`; it is never pointed at the live prototype database.

Re-run the connected prototype acceptance check with `npm run test:e2e:prototype`.

Screenshots are in [`docs/screenshots`](screenshots).
