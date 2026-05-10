# Security Architecture

## Controls Added In Phase 3

- Production environment schema validation with startup failure.
- Admin-only operations APIs.
- Request correlation IDs on protected operational routes.
- In-memory API rate limiting for payout execution paths.
- CSRF protection for cookie-backed browser mutations.
- Idempotency/replay prevention for payout execution requests.
- Webhook timestamp and nonce freshness checks.
- Dodo and Helius failed webhook capture in a dead-letter queue.
- Solana program ID allowlisting.
- Treasury wallet whitelist validation.
- Recipient wallet blacklist and sanity checks.

## Tenant Enforcement

API routes use `requireTenantContext` or `requireAdmin`, backed by Supabase JWT validation and `CompanyUser` membership lookup.

## Financial Integrity

Payouts are protected by the unique `Payout.invoiceId` constraint, recovery reconciliation, and audit records for on-chain success with database confirmation failure.
