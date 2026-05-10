# Production Setup Guide

## Database

Use a managed Postgres instance with automated backups, point-in-time recovery, SSL, and a restricted network allowlist. Apply migrations with `npm run db:migrate:prod`.

## Solana

Use devnet for pilots until contract audit and treasury policies are complete. Configure:
- `TREASURY_WALLET_SECRET_KEY`
- `TREASURY_WALLET_ADDRESS`
- `TREASURY_WALLET_WHITELIST`
- `ESCROW_PROGRAM_ID`
- `ALLOWED_ESCROW_PROGRAM_IDS`

Fund the treasury USDC associated token account before running payroll.

## Webhooks

Configure Dodo and Helius to send timestamp and nonce headers. Production rejects expired webhook timestamps and replayed nonces.

## Admin Operations

Use `/operations` for health, payout monitoring, dead-letter webhooks, reconciliation warnings, and recovery actions. API access requires an admin bearer token.
