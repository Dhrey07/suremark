# Requirements traceability

Status reflects repository evidence as of 25 October 2026. “Verified” means a relevant automated check or production build ran successfully; it does not imply external certification.

| ID | Requirement | Status | Implementation evidence | Missing / dependency | Required verification |
|---|---|---|---|---|---|
| ARCH-01 | Modular full-stack application | Implemented and verified | `src/app`, `src/lib/services`, `src/db`; webpack production build | None | Build and type-check |
| GOV-01 | Manufacturer review and approval | Implemented but not fully tested | `src/app/platform`, `src/lib/services/catalog.ts` | Document/RFI workflow remains | PostgreSQL workflow test |
| GOV-02 | Suspension and reactivation | Implemented but not fully tested | `manufacturers.operational_status`, `manufacturer_review_events`, platform action/UI | Database test blocked locally | Suspension concurrency and session-revocation tests |
| GOV-03 | Secure document upload/review | Not implemented | — | Private object storage and malware scanner | Cross-tenant upload/access tests |
| GOV-04 | Authorized representatives | Partially implemented | Users and organization memberships | Dedicated representative lifecycle | Permission and audit tests |
| CAT-01 | Product registration and approval | Implemented but not fully tested | `products`, catalog service, product/platform pages | Generalized model incomplete | Catalog integration tests |
| CAT-02 | Families, brands, variants, packaging and versioning | Partially implemented | Current product records combine product and variant | Normalized family/variant/version tables and migration | Historical assignment tests |
| SITE-01 | Factory and production-line model | Partially implemented | `factories`, `production_lines`, scoped grants | Complete CRUD UI, equipment/capacity | Tenant/scope E2E tests |
| RBAC-01 | Manufacturer RBAC and resource-scoped ABAC | Implemented but not fully tested | `src/lib/authz.ts`, `src/lib/actor.ts`, tenant FKs | Product/batch grant types and DB RLS | Existing PostgreSQL authorization suite |
| RBAC-02 | Maker-checker and separation of duties | Implemented but not fully tested | `requireIndependent`, DB approval constraint | Extend to all future privileged modules | Existing workflow suite |
| RBAC-03 | All requested organization/platform roles | Partially implemented | Role templates | Inventory/security roles and finer platform roles | Permission matrix tests |
| AUTH-01 | Passwords, domain-bound login, recovery and sessions | Implemented but not fully tested | `password.ts`, `session.ts`, explicit login routes, `password-reset.ts`, migrations `0003` | Production email delivery adapter | Authentication integration/E2E |
| AUTH-02 | MFA and step-up authentication | Not implemented | — | Enrolment, recovery codes, challenge policy | Replay/bypass/security tests |
| ID-01 | Unique product identity | Implemented but not fully tested | Private processing engine, unique index, immutability triggers | Managed KMS operational controls | Existing issuance/concurrency suite |
| ID-02 | Versioned credential authentication | Implemented but not fully tested | Private processing engine | Managed KMS/HSM provider | Credential unit tests and rotation test |
| ID-03 | Manual verification references | Implemented but not fully tested | Private processing engine and protected registry | Capacity review before scale | Existing code tests |
| ID-04 | Atomic, retry-safe issuance | Implemented but not fully tested | Transactional issuance and unique-conflict retries | External job queue for very large allocations | Existing concurrency suite and load test |
| PROD-01 | Batch/allocation/print/reconcile/QA/release | Implemented but not fully tested | Production service and manufacturer pages | More granular lifecycle vocabulary | Existing PostgreSQL workflow suite and E2E |
| PROD-02 | Printer/camera integration | Implemented using a development simulator | Line simulator validates credentials | Certified hardware/provider | Contract and hardware acceptance tests |
| DIST-01 | Warehouses, inventory and shipments | Not implemented | — | Schema, services, UI, roles and tests | Inventory concurrency/E2E |
| VERIFY-01 | Public manual and QR verification | Implemented but not fully tested | Public pages, `/api/v1/verify/*`, shared `verify.ts` | Browser camera scanner/help route | Existing verification suite and browser E2E |
| VERIFY-02 | Honest lifecycle outcomes | Implemented but not fully tested | Shared result contract and precedence | None known | Existing verification tests |
| USSD-01 | Shared USSD verification | Implemented using a development simulator | `ussd.ts`, callback route, browser phone | Authorized aggregator and shortcode | Existing USSD tests plus provider certification |
| REPORT-01 | Anonymous suspicious-product reporting | Implemented but not fully tested | Public report page/API and consumer reports | Secure photo upload | Abuse and E2E tests |
| FRAUD-01 | Automated verification risk signals | Implemented but not fully tested | `verify.ts`, risk cases | Configurable policy store and enumeration cases | Existing risk tests and load tests |
| FRAUD-02 | Investigation workflow | Partially implemented | Case triage, status and resolution | Assignment, notes, evidence, escalation, quarantine | Workflow/security tests |
| RECALL-01 | Dual-control recall and consumer warning | Implemented but not fully tested | `recalls.ts`, batch UI, verification precedence | Distribution impact and notifications expansion | Existing recall tests and E2E |
| NOTIFY-01 | Database-backed in-app notifications | Implemented but not fully tested | `notifications` migration, service, page, unread badge | Retry/outbox and full event coverage | PostgreSQL service and E2E tests |
| FILE-01 | Secure file/image handling | Not implemented | — | Private object store, signed URLs, scanning, retention | File-validation and isolation tests |
| API-01 | Versioned public APIs | Implemented but not fully tested | `/api/v1/verify`, reports, USSD, keys | OpenAPI schema | Route tests |
| API-02 | Versioned privileged APIs | Not implemented | Browser operations use secured server actions | Service-account transport and OpenAPI | Endpoint authorization/validation tests |
| DATA-01 | PostgreSQL integrity and append-only history | Implemented but not fully tested | Migrations, tenant FKs, unique indexes, guards | Verified RLS policies, rollback rehearsal | Migration and integrity suite |
| DATA-02 | PostgreSQL row-level security | Not implemented | — | Separate runtime/migration roles and tested policies | Policy tests under actual DB roles |
| UI-01 | Responsive accessible workspaces | Partially implemented | Mobile-first components, scrollable tables, focus styles | Full viewport, keyboard, screen-reader audit | Playwright screenshots and axe |
| TEST-01 | Unit/integration tests | Partially implemented | Vitest suites under `tests/` | Database unavailable in current sandbox | Run with `TEST_DATABASE_URL` in CI |
| TEST-02 | Browser E2E, visual and accessibility tests | Not implemented | — | Playwright and axe setup | CI browser matrix |
| TEST-03 | Load and contention tests | Not implemented | — | Defined pilot profile and runner | Staging load run |
| OPS-01 | Environment validation and health checks | Partially implemented | `env.ts`, deployment README | Readiness endpoint, metrics and tracing | Deployment smoke test |
| OPS-02 | Logging, queues, backup/restore and incident response | Partially implemented | Audit log and platform logs | Structured telemetry, queues/DLQ, managed backups | Restore drill and incident exercise |

## External dependencies

The following cannot be truthfully marked complete without customer/provider infrastructure or authorization: production KMS/HSM keys and policy, USSD aggregator provisioning, printer/camera hardware certification, malware-scanning service, private object storage, production Redis, NAFDAC/CAC/GS1 data access, production database roles for RLS, monitoring/error-tracking accounts, and managed backup/restore infrastructure.

