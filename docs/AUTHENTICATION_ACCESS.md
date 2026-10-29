# Local authentication access guide

These accounts exist only after seeding a controlled development database. The account picker is disabled in production builds even when an environment variable is misconfigured. Every listed account authenticates against a password hash and session stored in PostgreSQL; there is no mock-session fallback.

## URLs

- Application: `http://localhost:3000`
- Public verification: `http://localhost:3000/verify`
- Manufacturer login: `http://localhost:3000/manufacturer/login`
- Manufacturer dashboard: `http://localhost:3000/manufacturer/dashboard`
- Manufacturer onboarding: `http://localhost:3000/manufacturer/onboarding`
- Platform login: `http://localhost:3000/platform/login`
- Platform dashboard: `http://localhost:3000/platform/dashboard`

## Local demo credentials

| Workspace | Role | Email | Password |
|---|---|---|---|
| Platform | Platform Administrator | `platform.admin@demo.test` | `DemoPlatform2026!` |
| Manufacturer | Organization Owner | `manufacturer.owner@demo.test` | `DemoManufacturer2026!` |
| Manufacturer | Production Manager | `production.manager@demo.test` | `DemoProduction2026!` |
| Manufacturer | Quality Assurance Officer | `qa.officer@demo.test` | `DemoQuality2026!` |
| Manufacturer | Production Line Operator | `line.operator@demo.test` | `DemoOperator2026!` |

Passwords are hashed with scrypt and a unique random salt before storage. The application never performs plaintext password comparisons.

## Commands

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

`db:seed` resets the configured database unless called by the deployment script with `--if-empty`. Never point the demo seed command at production.

## Security behavior

- Sign-in is disabled when PostgreSQL is unavailable. The application never substitutes a mock session or static dashboard.
- Each login action accepts only its intended account domain.
- Login failures use a generic response and a database-backed attempt limit.
- Sessions use opaque random tokens stored as hashes and HTTP-only, same-site cookies.
- Suspended manufacturers lose effective memberships and their sessions are revoked.
- Password-reset tokens are random, hashed at rest, expire after 30 minutes, are single-use, and revoke all sessions after use.
- In development demo mode, reset requests display a local reset link. Production requires a transactional email adapter.

## Verification evidence

- TypeScript and production build results are recorded in `docs/IMPLEMENTATION_REPORT.md`.
- PostgreSQL login and migration tests require a reachable local or CI database; the current restricted execution environment blocks those connections.

