# API Reference

## Admin

- `GET /api/admin/system-health`: service status, payout success rate, failed jobs, dead-letter webhooks, treasury and escrow checks.
- `GET /api/admin/metrics`: payout, treasury, webhook latency, and outstanding escrow metrics.
- `GET /api/admin/reconciliation-report`: open and recent reconciliation audits plus failed jobs and dead-letter webhooks.
- `POST /api/admin/recovery/payouts`: reconcile failed or pending payouts for the tenant.
- `POST /api/admin/recovery/webhooks`: replay dead-letter webhooks.

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
