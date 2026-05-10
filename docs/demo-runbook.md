# Demo Runbook

## Preflight

1. Confirm `npm run verify:prod`.
2. Confirm treasury devnet USDC balance.
3. Confirm Dodo and Helius webhook secrets.
4. Confirm `/api/admin/system-health` returns healthy.

## Demo Flow

1. Show `/dashboard` treasury and invoice queue.
2. Create or select an invoice.
3. Approve invoice.
4. Execute escrow-backed payout.
5. Open Solana explorer transaction.
6. Show `/operations` metrics and reconciliation.
7. Export payout and treasury CSVs from compliance/audit flows.

## Talking Points

- Escrow lifecycle is enforced, not bypassed.
- Duplicate payouts are blocked.
- Failed payouts and webhooks have recovery queues.
- Production configuration is schema-validated.
- CI validates typecheck, tests, build, Anchor build, and migration diff.
