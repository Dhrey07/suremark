# Architecture and security notes

## Trust boundaries

Public consumers can submit only a QR credential, numeric reference, USSD input, or report. Authenticated manufacturer users operate within one active membership. Platform and regulator users have separate domains and permissions. Cryptographic secrets never cross the server boundary.

Authenticated reads and writes apply tenant filters and resource grants. Sensitive mutations call server-side authorization even when the UI hides the corresponding action. Other-tenant identifiers are returned as not found. Maker-checker rules compare user IDs, so changing roles cannot let a creator approve the same restricted action.

## Identity issuance

Identity generation, credential authentication and verification are restricted to the private server-side processing engine. Public and authenticated user interfaces receive only the operational result required for their role. Issuance is transactional, registered identities are immutable, and audit, production and verification events are append-only.

## Lifecycle

The prototype uses a compact persisted lifecycle:

`draft → allocation_pending → allocated → reconciled → released → recalled`

Units move independently through reserved, printed-pending, QA-pending, active, voided/rejected, and recalled states. A successful print API response is not treated as physical proof. Release requires a balanced reconciliation and an independent QA actor.

## Verification outcome precedence

Active recall takes precedence, followed by unreleased state, expiry, and anomaly evaluation. Repeated scans are evidence, not an automatic counterfeit verdict. Location is stored only at coarse Nigerian-state level, and device/phone identifiers are keyed hashes.

Operational failures return `unavailable`; they never classify a product as counterfeit.

## Deployment topology

Deploy the Next.js application and background-capable runtime in one region close to PostgreSQL. Use pooled application connections and an unpooled migration connection. Production additions should include Redis, object storage with malware scanning, managed KMS/HSM, centralized structured logs, metrics/traces, alerting, and a web application firewall.

## Residual cloning risk

A valid QR or numeric code can be copied from a genuine pack. Digital verification can detect suspicious reuse patterns but cannot always identify the physical copy. Production packaging should combine the credential with tamper-evident seals, destructible labels, covert or forensic print features, controlled label stock, line-camera inspection, and supply-chain investigation procedures.

