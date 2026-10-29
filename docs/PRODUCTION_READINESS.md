# Production-readiness checklist

## Application

- [x] TypeScript production source compiles.
- [x] Alternate webpack production build succeeds in the restricted environment.
- [ ] Default production build succeeds in CI.
- [ ] PostgreSQL integration suite passes in CI.
- [ ] Browser E2E, responsive screenshots, and accessibility checks pass.
- [ ] Defined-load verification and issuance tests pass.

## Security

- [x] Server-side RBAC/ABAC and maker-checker are present for existing production workflows.
- [x] Identity records and security events have database immutability controls.
- [x] Manufacturer suspension is enforced from fresh database state and revokes member sessions.
- [ ] MFA, step-up, account recovery, service accounts, and machine replay protection are complete.
- [ ] Managed KMS/HSM, Redis rate limiting, private uploads, malware scanning, and tested RLS are enabled.
- [ ] Independent threat model, code review, penetration test, and privacy review are signed off.

## Operations

- [ ] Central logs, metrics, traces, error tracking, alerts, and runbooks are active.
- [ ] Backups, point-in-time recovery, restore drills, retention, and deletion procedures are approved.
- [ ] Incident response owners and regulator/customer notification procedures are exercised.
- [ ] USSD, manufacturing hardware, and regulatory-provider integrations are contractually authorized and certified.

No unchecked item may be implied complete in sales, regulatory, or production-readiness claims.

