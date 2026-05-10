# API Reference

## Admin

- `GET /api/admin/system-health`: service status, payout success rate, failed jobs, dead-letter webhooks, treasury and escrow checks.
- `GET /api/admin/metrics`: payout, treasury, webhook latency, and outstanding escrow metrics.
- `GET /api/admin/reconciliation-report`: open and recent reconciliation audits plus failed jobs and dead-letter webhooks.
- `POST /api/admin/recovery/payouts`: reconcile failed or pending payouts for the tenant.
- `POST /api/admin/recovery/webhooks`: replay dead-letter webhooks.
- `GET/POST /api/admin/compliance/alerts`: list compliance alerts and upsert governance policies.

## Audit Exports

`GET /api/audit/export?format=csv&type=payouts`

Supported `type` values:
- `payouts`
- `treasury`
- `invoices`
- `webhooks`
- `reconciliation`

## Payouts

- `POST /api/payouts/execute`: escrow-backed single payout.
- `POST /api/payouts/batch`: atomic batch payout.

Both mutation routes enforce admin auth, rate limits, idempotency keys, recipient validation, and request correlation IDs.

## Enterprise Tenancy

- `GET/POST/PATCH /api/organizations`: organization provisioning, membership, and company governance controls.
- `GET/POST/PATCH /api/api-keys`: scoped API key issuance, listing, rotation, and revocation.
- `GET/POST/PATCH /api/partners`: partner provisioning, webhook subscriptions, and white-label settings.

Enterprise APIs support:
- Admin JWT auth
- API key auth (`x-api-key`) with least-privilege scopes
- Organization/company tenant isolation checks
