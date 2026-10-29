# API guide

All public endpoints return consumer-safe results and use the shared verification domain service.

## Public verification

### `POST /api/v1/verify/code`

JSON body: `{ "code": "4827391605732218" }`. Formatting spaces are accepted. The response contains a status, headline, message, checked time, and product/manufacturer/batch fields only when a registered unit resolves.

### `POST /api/v1/verify/qr`

JSON body: `{ "payload": "<credential>" }`. Validation occurs inside the private processing engine before registry and lifecycle evaluation.

### `POST /api/v1/reports`

Accepts the public suspicious-product report form. Contact identity is deliberately not required or publicly exposed.

### `POST /api/v1/ussd/callback`

Provider-adapter callback used by the simulated phone. It validates the callback signature, maintains session state, and delegates code checks to the shared verification service.

## Authenticated operations

The current browser product uses typed Next.js server actions rather than duplicating the same mutations behind REST endpoints. These actions validate input, require a database session, enforce RBAC/ABAC and workflow state, and append audit events. A future machine API should be a thin transport layer over the existing catalog, production, recall, and audit services, with idempotency keys and service-account authentication.

## Status contract

- `issued_no_known_alerts`: registered, released identity with no current signals.
- `suspicious`: valid issued identity with unusual reuse history.
- `not_released`: registered identity that is not active for sale.
- `expired`: released identity whose batch expiry date has passed.
- `recalled`: identity belongs to an active recall.
- `invalid_code`: manual reference fails format/check-digit validation.
- `unable_to_verify`: no authentic registered identity could be resolved.
- `rate_limited`: abuse threshold reached.
- `unavailable`: operational failure; no authenticity conclusion was made.

