# Deployment and operations

## Release gate

1. Provision Supabase Postgres and copy the pooler URL for runtime plus a direct or session-pooler URL for migrations.
2. Set the variables documented in `.env.example`; store secrets in the hosting provider, never in source control.
3. Run `npm ci` and `npm run db:migrate`. Run `npm run db:seed -- --if-empty` only for a controlled evaluation environment; it is never a production bootstrap step.
4. On a new production database, set the three `BOOTSTRAP_ADMIN_*` variables, run `npm run db:bootstrap-admin` once, then remove those variables and rotate the initial password after first sign-in.
5. Run `npm run typecheck`, `npm test`, and `npm run build`.
6. Smoke-test sign-in, manufacturer approval, allocation, printing, reconciliation, release, QR/manual verification, report, recall, notification, and USSD simulation.
7. Confirm backups and perform a restore into an isolated database before enabling writes.

Cryptographic configuration must remain inside the protected processing environment. Production deployments must use managed KMS/HSM key versions and follow the private rotation runbook.

The Supabase Data API roles (`anon` and `authenticated`) have no direct privileges on application tables, and RLS is enabled as defense in depth. The public publishable key cannot bypass the server-side RBAC, tenant scope, maker-checker checks, or audit chain. Do not add broad Supabase RLS policies for these tables without duplicating and testing those controls.

## Migration safety

Migrations are forward-only in production. Take a verified backup before applying them. Migration `0002_governance_notifications` is additive and backfills existing manufacturers as active. Rollback should deploy the prior application first, retain the added tables/columns, and remove them only after confirming no newer application is writing them. Never roll back by deleting issued identity data or append-only events.

## Backup and restore

Enable point-in-time recovery and daily encrypted snapshots. Retain backups according to the approved privacy and regulatory schedule. At least quarterly, restore the latest snapshot into an isolated account, run migrations, verify audit-chain integrity, sample issued credentials, and record recovery time and data-loss windows.

## Health and observability

Production requires platform-level liveness, database readiness, structured logs with request correlation IDs, latency/error metrics, traces, database pool monitoring, alert routing, and redaction rules. Audit records are security evidence and do not replace operational logs. Never log passwords, session tokens, signing material, plaintext API secrets, or full consumer identifiers.

