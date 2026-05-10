# Deployment Guide

Borderless Payroll Copilot deploys as a Next.js app backed by Postgres, Prisma, Supabase auth, Solana devnet RPC, Dodo billing webhooks, and Helius treasury webhooks.

## Release Gates

1. `npm ci`
2. `npx prisma generate`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. `npm run verify:prod`
7. `npm run db:migrate:prod`

Run `npm run test:e2e:devnet` only with seeded devnet wallets and a real database.

## Required Production Variables

Use `.env.production.example` as the source of truth. Production startup fails if required values are missing or malformed.

Critical values:
- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `TREASURY_WALLET_SECRET_KEY`
- `TREASURY_WALLET_ADDRESS`
- `ESCROW_PROGRAM_ID`
- `HELIUS_WEBHOOK_SECRET`
- `DODO_WEBHOOK_SECRET`
- `APP_ORIGIN`

## Docker

Build: `docker build -t borderless-payroll-copilot .`

Run locally: `docker compose up --build`

The app image runs with `NODE_ENV=production` and expects externally managed secrets in real deployments.
