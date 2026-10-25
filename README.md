# Product Authentication Platform — pitch prototype

Unit-level product identity for regulated goods. Manufacturers issue a unique identity, never reused, for every physical pack; consumers check it by **QR scan, a 16-digit code on the web, or USSD** — no app and no scratch panel. A regulator gets a read-only national view.

> All companies, people, products and registration numbers are fictional. This is not an official NAFDAC or GS1 service.

## What the prototype demonstrates

| Blueprint requirement | Where it lives |
|---|---|
| 128-bit CSPRNG unit identities, globally unique, never reused | `src/lib/services/production.ts` (`issueUnits`), unique index + DB triggers in `drizzle/` |
| Signed QR credential (Ed25519, versioned keys, offline verifiable) | `src/lib/credential.ts`, `src/lib/kms.ts`, `GET /api/v1/keys`, `scripts/verify-offline.ts` |
| 16-digit numeric fallback, Damm check digit, keyed lookup digest | `src/lib/codes.ts`, `manual_codes` table |
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

- **Key management**: keys are derived from `MASTER_SECRET` (HKDF) inside one module with KMS-shaped operations. Production replaces `src/lib/kms.ts` with a managed KMS/HSM client.
- **Printer and inline camera**: the line simulator really decodes and signature-checks every printed credential; only the hardware is simulated.
- **USSD aggregator**: the phone simulator sends signed callbacks to the real `/api/v1/ussd/callback` adapter (shortcode `*347*800#` is a placeholder).
- **KYB checks and regulator data feeds**: reviewer decisions are manual; registration numbers are as declared by the manufacturer.
- **Not included**: MFA, machine (mTLS) credentials, distribution/shipment events, quarantine, carton aggregation.

## Pitch walkthrough (about 10 minutes)

Sign in from `/login` — in demo mode each person is one click.

**Ready-made codes:** while signed in, open `/demo` (*Sample packs*) for real QR codes and 16-digit codes from the seeded batches — genuine, copied, recalled, expired, never-released, made-up, forged and mistyped — each labelled with the result it produces.

1. **Chioma Eze** (Production Manager) → Batches → *New batch* on **Ikeja L1**, then *Request identity allocation*. Try approving it yourself: not possible.
2. **Ibrahim Musa** (Factory Manager) → Approvals → *Approve and issue*. Identities, signatures and codes are issued in one transaction.
3. **Samuel Adeyemi** (Line Operator) → Line jobs → *Start job* → *Open print sheet* (scan a QR with a phone) → *Run line* (a few smudged labels get rejected) → *Finish run*.
4. **Chioma** → batch page → *Reconcile*. A wrong physical count is refused and logged.
5. **Fatima Bello** (QA) → *Release*. Only now do units become verifiable.
6. **Consumer**: scan a label's QR with a phone → *Identity issued — no known alerts*. On the laptop, set *Demo · simulate check location* to Kano and type the same code → *Possible copied code*. Try a rejected label's code → *Not released*. Try `/ussd`.
7. **Ngozi Obi** (Compliance) → batch → *Propose recall*; **Adaeze Okafor** (Owner) approves. Re-check any code → recall warning.
8. **Regulatory Analyst** → `/regulator`: national checks, outcomes, risk cases, recalls, public keys.
9. **Kemi Adebayo** (Platform) → approve the pending applicant and product; *Reset demo data* returns everything to the starting state.

## Deploying on Vercel

1. Import this repository into Vercel (framework: Next.js; the `vercel-build` script runs migrations, seeds an empty database, then builds).
2. Project → **Storage** → add **Neon Postgres**. It sets `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`, used for migrations).
3. Project → Settings → **Environment Variables**:
   - `MASTER_SECRET` — at least 32 random bytes, e.g. `openssl rand -base64 48`. Keep it stable: changing it invalidates every printed QR and code.
   - `DEMO_MODE=true` and `DEMO_PASSWORD=<choose one>` for the pitch.
   - Optional `SIGNING_KEY_VERSION` (default `1`), `REVOKED_KEY_VERSIONS`, `PUBLIC_BASE_URL` (defaults to the production domain).
4. Deploy. Printed QR codes point at the production domain, so phones can scan them.

## Local development

```bash
npm install
cp .env.example .env.local   # set DATABASE_URL and MASTER_SECRET
npm run db:migrate && npm run db:seed
npm run dev
```

Tests run against a real PostgreSQL database (`TEST_DATABASE_URL`, default `postgres://postgres@127.0.0.1:5432/upa_test`):

```bash
npm test         # 41 tests: issuance, concurrency, maker-checker, tenancy, verification parity, clone signals, rate limits, USSD, recall, audit chain
npm run typecheck
```

Offline check of any printed QR using only the public keys:

```bash
npx tsx scripts/verify-offline.ts "https://<your-domain>/v/<payload>"
```

## Decisions taken for the prototype (open per blueprint §21)

- **Numeric code**: 15 random digits + 1 Damm check digit (`4827 3916 0573 2218`), one national namespace, typed as digits only. 10¹⁵ space; length is a constant in `src/lib/codes.ts` and should be confirmed against real issuance forecasts.
- **QR proof**: Ed25519 signatures (public verification) rather than HMAC.
- **Allocation quota**: planned quantity + 10% spoilage allowance; prototype cap 5,000 units per batch.
- **Copied-code signals**: >250 km/h implied travel over ≥150 km, ≥5 devices, or ≥15 checks per code. These are risk signals for investigation, never a "fake" verdict.

## Stack

Next.js 16 (App Router, server actions, route handlers) · PostgreSQL via Drizzle ORM · Node crypto (Ed25519, HKDF, HMAC, AES-GCM) · Tailwind CSS 4 · Vitest.
