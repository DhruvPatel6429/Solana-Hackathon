# Investor Technical Architecture Summary

Borderless Payroll Copilot is a programmable stablecoin payroll platform for companies paying global contractors.

## Core Architecture

- Next.js application with admin and contractor surfaces.
- Postgres with Prisma and tenant-scoped access patterns.
- Supabase JWT authentication and admin authorization.
- Solana devnet USDC treasury and escrow-backed payouts.
- Dodo billing integration for checkout, subscriptions, payments, and usage.
- Helius treasury webhook sync.
- Audit exports for payouts, treasury, invoices, webhooks, and reconciliation.

## Enterprise Readiness

Phase 3 adds operational controls expected by pilots and diligence:
- Real devnet E2E validation harness.
- Recovery services for payouts, escrow, and webhooks.
- Security guardrails for env, APIs, webhooks, wallets, and program IDs.
- Structured logs and admin metrics.
- CI/CD, Docker, migration validation, production scripts.
- Incident, deployment, security, webhook, contract, and demo documentation.
