# Product experience and information architecture

## Product identity

The rebuilt experience is branded **Suremark**: an original trust mark for product verification. The visual system uses warm cream foundations, clean white working surfaces, near-black typography, deep botanical green, and a restrained lime signal color. It intentionally avoids generic purple fintech styling, excessive shadows, and decorative gradients.

The interface follows three principles:

1. Lead with the user’s next decision, not the underlying module.
2. Keep cryptography in the trust layer; show ordinary people product codes, production runs, quality review, and clear outcomes.
3. Use hierarchy and whitespace to distinguish what matters instead of giving every metric or action equal visual weight.

## Public experience

The homepage has one dominant task: enter a product code. USSD and reporting remain accessible secondary paths. Consumer copy is intentionally plain and avoids implying that a valid digital code proves the physical pack cannot be a clone.

Primary public routes:

- `/` — verify a product.
- `/v/[payload]` — resolve a scanned QR credential.
- `/ussd` — demonstrate checking without mobile data.
- `/report` — privately report a suspicious product.
- `/demo` — clearly labelled sample packs in demo mode.

## Manufacturer workspace

Navigation is grouped by real work:

- **Workspace:** Home and approvals.
- **Production:** Products, production runs, and print jobs.
- **Trust:** Security alerts and recalls.
- **Organization:** Notifications, team and roles, and audit trail.

Items remain permission-aware. Operators are not shown organization administration. “Batches” are presented as “production runs” in user-facing navigation while internal domain naming remains stable to avoid unsafe migrations.

## Platform workspace

The current platform surface is a network overview combining live identity totals, organizational standing, attention signals, manufacturer governance, and product review. Future platform routes should preserve the grouping in the requirements traceability document rather than expanding one unstructured sidebar.

## Responsive behavior

- Mobile navigation becomes a deliberate horizontal task rail with fixed touch height.
- Desktop navigation becomes grouped and vertically persistent.
- Tables use explicit horizontal scrolling where card conversion would hide operational relationships.
- Primary public actions remain at least 48px high; operational controls remain at least 44px high.
- Large headings use bounded `clamp()` sizing rather than global font reduction.
- Reduced-motion preferences remove nonessential movement.

