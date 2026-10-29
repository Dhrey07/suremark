# Product Authentication Platform — pitch prototype

Unit-level product identity for regulated goods. Manufacturers issue a unique identity, never reused, for every physical pack; consumers check it by **QR scan, a 16-digit code on the web, or USSD** — no app and no scratch panel. A regulator gets a read-only national view.

> All companies, people, products and registration numbers are fictional. This is not an official NAFDAC or GS1 service.

Engineering documentation: [authentication access](docs/AUTHENTICATION_ACCESS.md), [implementation audit](docs/IMPLEMENTATION_AUDIT.md), [UX architecture](docs/UX_ARCHITECTURE.md), [requirements traceability](docs/REQUIREMENTS_TRACEABILITY.md), [architecture and security](docs/ARCHITECTURE.md), [API guide](docs/API.md), [deployment guide](docs/DEPLOYMENT.md), [production-readiness checklist](docs/PRODUCTION_READINESS.md), and [implementation report](docs/IMPLEMENTATION_REPORT.md).

## What the prototype demonstrates

| Blueprint requirement | Where it lives |
|---|---|
| Private server-side identity issuance and verification | Restricted processing engine and database integrity controls |
| Permanent manufacturer prefix and automatic family-based product codes | `src/lib/services/onboarding.ts`, `src/lib/services/catalog.ts`, immutable database triggers |
| Versioned packaging, multi-batch plans, carton hierarchy and carton credentials | `packaging_versions`, `cartons`, batch-plan and batch-detail pages |
| Issuance ≠ activation: reserve → print → camera check → reconcile → QA release | `src/lib/services/production.ts`, print-job and batch pages |
| Maker-checker and separation of duties (compared by user id, enforced in DB too) | `src/lib/authz.ts` (`requireIndependent`), `approval_requests` check constraint |
| RBAC + resource scope (organisation / factory / line), tenant isolation | `src/lib/authz.ts`, `src/lib/actor.ts`, composite tenant foreign keys |
| QR / web / USSD parity with truthful outcomes | `src/lib/verify.ts`, `src/lib/ussd.ts` |
| Copied-code signals (impossible travel, many devices, volume), leaked-label alerts | `src/lib/verify.ts`, Alerts & cases page |
| Anti-enumeration: rate limits, generic failures | `src/lib/ratelimit.ts`, `src/lib/verify.ts` |
| Recall with dual control, propagated to every channel | `src/lib/services/recalls.ts` |
| Append-only, hash-chained audit log incl. denials | `src/lib/audit.ts`, Audit log page |
| Regulator read-only national view | `/regulator` |

### Simulated in this prototype

- **Key management**: cryptographic material remains inside the private server-side processing boundary. Production uses a managed KMS/HSM provider.
- **Printer and inline camera**: the line simulator validates every printed credential; only the hardware is simulated.
- **USSD aggregator**: the phone simulator sends signed callbacks to the real `/api/v1/ussd/callback` adapter (shortcode `*347*800#` is a placeholder).
- **Regulatory data feed**: production entries are recorded as unavailable for authoritative verification until an approved source is connected. The one fictional Fanta development record is visibly labelled “simulated” everywhere and is never presented as an official NAFDAC result.
- **Not included**: MFA, machine (mTLS) credentials, distribution/shipment events, or quarantine.

## Pitch walkthrough (about 10 minutes)

Sign in from `/login` — in demo mode each person is one click.

**Ready-made codes:** while signed in, open `/demo` (*Sample packs*) for real QR codes and 16-digit codes from the seeded batches — genuine, flagged as copied, recalled, expired, never-released, made-up, forged and mistyped — each labelled with the result it produces.

1. **Chioma Eze** (Production Manager) → Batches → *New batch* on **Ikeja L1**, then *Request identity allocation*. Try approving it yourself: not possible.
2. **Ibrahim Musa** (Factory Manager) → Approvals → *Approve and issue*. Identities and verification references are issued in one transaction.
3. **Samuel Adeyemi** (Line Operator) → Line jobs → *Start job* → *Open print sheet* (scan a QR with a phone) → *Run line* (a few smudged labels get rejected) → *Finish run*.
4. **Chioma** → batch page → *Reconcile*. A wrong physical count is refused and logged.
5. **Fatima Bello** (QA) → *Release*. Only now do units become verifiable.
6. **Consumer**: scan a label's QR with a phone → *Identity issued — no known alerts*. Use the *Copied code* sample on `/demo` → *Possible copied code*. Try a rejected label's code → *Not released*. Try `/ussd`.
7. **Ngozi Obi** (Compliance) → batch → *Propose recall*; **Adaeze Okafor** (Owner) approves. Re-check any code → recall warning.
8. **Regulatory Analyst** → `/regulator`: national checks, outcomes, risk cases, recalls, public keys.
9. **Kemi Adebayo** (Platform) → approve the pending applicant and product; *Reset demo data* returns everything to the starting state.

## Supabase database integration

1. In Supabase, open **Connect → ORMs**. Copy the transaction pooler URL to `DATABASE_URL` and the direct or session-pooler URL to `DATABASE_URL_UNPOOLED`. Keep `sslmode=require`.
2. Add the public project URL and publishable key as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The public key is not a replacement for the PostgreSQL connection string.
3. Add these values to `.env.local` and to the deployment environment:
   - `MASTER_SECRET` — at least 32 random bytes, e.g. `openssl rand -base64 48`. Keep it stable: changing it invalidates every printed QR and code.
   - `DEMO_MODE=false` for production. Database-backed demonstration accounts and reset controls are available only when this is deliberately enabled outside production.
   - Optional `SIGNING_KEY_VERSION` (default `1`), `REVOKED_KEY_VERSIONS`, `PUBLIC_BASE_URL` (defaults to the production domain).
4. Run `npm run db:migrate`. For a controlled evaluation database, run `npm run db:seed -- --if-empty`; never run the resetting seed against production data.
5. Deploy. The frontend, server actions, sessions, RBAC, audit log, issuance, and verification services all use the same Supabase PostgreSQL database through Drizzle transactions.

## Local development

```bash
npm install
cp .env.example .env.local   # set the Supabase URLs, DATABASE_URL and MASTER_SECRET
npm run db:migrate && npm run db:seed
npm run dev
```

Create or resume the idempotent database-backed Fanta lifecycle scenario:

```bash
npm run prototype:fanta
```

Tests run against a real PostgreSQL database (`TEST_DATABASE_URL`, default `postgres://postgres@127.0.0.1:5432/upa_test`):

```bash
npm test         # 41 tests: issuance, concurrency, maker-checker, tenancy, verification parity, clone signals, rate limits, USSD, recall, audit chain
npm run test:unit # database-free credential and numeric-code suite
npm run typecheck
```

## Decisions taken for the prototype (open per blueprint §21)

- **Identity proof**: generated and validated only by the private processing engine.
- **Allocation quota**: planned quantity + 10% spoilage allowance; prototype cap 5,000 units per batch.
- **Copied-code signals**: >250 km/h implied travel over ≥150 km, ≥5 devices, or ≥15 checks per code. These are risk signals for investigation, never a "fake" verdict.

## Stack

Next.js 16 (App Router, server actions, route handlers) · PostgreSQL via Drizzle ORM · private server-side cryptographic processing · Tailwind CSS 4 · Vitest.
