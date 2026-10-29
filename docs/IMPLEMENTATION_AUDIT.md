# Implementation audit

Audit date: 25 October 2026

## Executive summary

The repository is already a cohesive, database-backed prototype rather than a collection of static screens. It uses a modular Next.js monolith with PostgreSQL and Drizzle, server-rendered workspaces, server actions for authenticated mutations, and versioned public route handlers. The core trust flow is implemented end to end: manufacturer review, product review, batch creation, dual-control identity allocation, printing simulation, reconciliation, QA release, public verification, risk signalling, recall, USSD parity, and append-only audit history.

The safest path is incremental hardening. Replacing the current stack would discard working security and workflow controls without providing a corresponding benefit.

## Current architecture

- Runtime: Node.js 22, Next.js 16 App Router, React 19, TypeScript 5.9.
- Data: PostgreSQL through Drizzle ORM; SQL migrations live in `drizzle/`.
- UI: Tailwind CSS 4 with small shared React components in `src/components/`.
- Authentication: opaque database sessions in an HTTP-only cookie; password hashes and demo sign-in are isolated in the authentication modules.
- Authorization: server-side platform RBAC plus manufacturer RBAC intersected with organization, factory, and line grants.
- Cryptography: isolated in the private server-side processing engine; implementation details are intentionally excluded from application documentation and user interfaces.
- Operations: server actions handle authenticated workflows; public verification and USSD use route handlers.
- Tests: Vitest integration suites cover cryptography, authorization, issuance, tenant isolation, concurrency, verification, audit integrity, recall, and USSD.

## Retain

- The modular-monolith architecture and App Router.
- The normalized tenant-aware schema and composite tenant foreign keys.
- Database uniqueness constraints and append-only triggers for identity and event records.
- The issuance/reconciliation/release state machine in `src/lib/services/production.ts`.
- The shared verification engine used by QR, numeric code, and USSD.
- Maker-checker enforcement by immutable user ID in both service and database layers.
- Consumer-safe outcome wording, which avoids claiming that a valid digital credential proves the physical pack is genuine.
- Provider-shaped KMS and USSD adapters, which make simulated dependencies explicit.

## Refactor or extend

- Split the large production service into batch, allocation, print, reconciliation, and release modules as the codebase grows.
- Replace role templates in source with versioned database roles and permissions when customer-specific roles are required.
- Add PostgreSQL row-level security after defining separate application and migration database roles. Existing tenant filters remain necessary as defence in depth.
- Add real MFA and step-up authentication for privileged credential, recall, and high-impact identity actions.
- Move rate-limit counters to Redis for horizontally scaled deployments; the current database implementation is correct for a pilot but not ideal at high volume.
- Add service-account credentials, rotation, replay protection, and mTLS/API gateway policy before connecting real line equipment.
- Add object storage and malware scanning before accepting product or consumer images.
- Expand platform operations into separate manufacturer, issuance, investigation, and audit views with server-side pagination.
- Introduce warehouses and batch-level shipments before claiming distribution traceability.

## Replace for production

- Replace the development key provider with a managed KMS or HSM while preserving historical verification capability.
- Replace the simulated printer/camera and USSD provider with certified, monitored adapters.
- Replace demo credentials and one-click sign-in with a production identity provider and enforced MFA policy.
- Replace local/demo reset semantics with environment-protected administrative tooling that is absent from production builds.

## Remove or avoid

- No obsolete route or duplicated business-logic family was identified in the current repository.
- Do not add a second verification implementation for REST, USSD, or QR.
- Do not expose signing material, decrypted manual codes, or unrestricted unit exports to browsers.
- Do not add fabricated dashboard values; all displayed operational totals must be queried from PostgreSQL.

## Known gaps against the master brief

- Manufacturer applications do not yet have document upload or requests-for-information. Suspension/reactivation, review history, session revocation, notifications, and transactional production/catalog enforcement are implemented in migration `0002` and the catalog governance service.
- Product records are intentionally pharmaceutical-oriented and need generalized family/variant, packaging, category, and versioning models.
- Factories and lines are seeded but do not yet have complete create/edit screens.
- There is no warehouse/shipment module, billing readiness, or machine/service-account portal. A database-backed notification centre exists, but full event coverage and an outbox/retry worker remain.
- Fraud cases support triage and closure but not investigator assignment, evidence attachments, escalation, or quarantine.
- MFA, CSRF token rotation beyond same-site session protections, secure uploads, managed Redis, KMS/HSM, and RLS are production gaps.
- The automated suite requires a real PostgreSQL test database. Browser E2E, accessibility, load, and screenshot-regression suites are not yet present.

## Verification performed

- `npm run typecheck`: passed.
- `npm test`: could not start because this execution sandbox blocks connections to local PostgreSQL (`EPERM 127.0.0.1:5432`).
- `npm run build`: Turbopack was blocked by the sandbox from binding its internal local port while processing CSS.
- `npx next build --webpack`: passed, including compilation, type validation, page-data collection, static generation, and trace collection. The alternate builder confirms the source produces a valid production build; CI should still exercise the repository's default build command in a normal environment.

