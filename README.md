# Borderless Payroll Copilot

Borderless Payroll Copilot is a B2B SaaS platform and treasury operating system for internet-native companies. It lets a company fund a single USDC treasury on Solana and pay global contractors in seconds, while automating invoices, FX visibility, payout rules, and compliance audit trails.

## Frontend demo

The hackathon frontend is implemented with Next.js 14 App Router, Tailwind CSS, shadcn-style local UI primitives, React Query, Zustand, Recharts, Framer Motion, lucide-react, and tsparticles.

### Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Frontend routes

| Route | Purpose |
| --- | --- |
| `/` | Dark landing page with particle hero, feature bento, pricing, and Dodo subscription CTAs |
| `/onboarding` | 4-step company onboarding wizard with tier checkout, treasury funding, and payout rules |
| `/dashboard` | Company dashboard with treasury, contractors, invoices, payouts, FX, modals, and mock API data |
| `/contractor` | Contractor portal with onboarding, invoice status, proof links, and payment history |
| `/contractor/invoices/new` | Invoice creation flow with dynamic line items and live preview |
| `/compliance` | Filterable audit table with CSV/PDF export controls and Solana explorer links |
| `/analytics` | Dark Recharts analytics for spend, currency mix, approval time, and treasury balance |

### Verification

```bash
npm run typecheck
npm run build
```

Mock data lives in `lib/mock-data.ts`, typed fetch wrappers live in `lib/api.ts`, and shared client data hooks live in `hooks/use-app-data.ts`.

## Problem and solution

International contractor payroll is slow, expensive, and opaque. Traditional wires introduce delays, unpredictable FX, and manual reconciliation, while most payroll tools do not support stablecoins or on-chain settlement.

Borderless Payroll Copilot solves this by consolidating treasury funding into a single USDC wallet on Solana, automating invoice workflows, executing instant batch payouts, and providing an audit-grade trail for every transaction.

## Target users

| User type                | Role                            | Key need                                                   |
| ------------------------ | ------------------------------- | ---------------------------------------------------------- |
| Finance admin or founder | Company-side operator           | Fund treasury, approve invoices, view compliance reports   |
| Contractor or freelancer | Global payee                    | Get paid fast in USDC or local off-ramp currency           |
| Platform owner           | Hackathon judges and evaluators | See Dodo billing and Solana integration working end to end |

## Core capabilities

- Business dashboard for treasury balance, contractor roster, invoice queue, payout queue, FX visibility, and analytics.
- Contractor portal for onboarding, wallet connection, invoice submission, payment history, and profile settings.
- Solana payout engine with batch payouts, escrow vaults, split settlements, and on-chain proof of payment.
- Invoice approval workflow with approval, escrow release, rejection reasons, and status updates.
- Dodo billing integration for subscriptions, usage reporting, hosted checkout, and billing webhooks.
- Compliance and audit page with payout history, proof links, and CSV or PDF exports.

## User workflows

1. Company signs up and completes Dodo checkout, then funds the USDC treasury.
2. Finance admin configures payout rules and invites contractors.
3. Contractor completes onboarding, sets payout preference, and connects a wallet if using USDC.
4. Contractor submits an invoice, admin approves or rejects it, and escrow releases funds on approval.
5. Payout executes on Solana, tx signature is stored, and usage events are reported to Dodo.
6. Compliance exports provide an audit trail for every payout and invoice.

## Technology stack

### Frontend

| Layer     | Technology                 | Purpose                                       |
| --------- | -------------------------- | --------------------------------------------- |
| Framework | Next.js 14 (App Router)    | SSR and routing for dashboards and API routes |
| Styling   | Tailwind CSS and shadcn/ui | Rapid UI development                          |
| State     | Zustand and React Query    | Client state and server data caching          |
| Wallet    | Solana Wallet Adapter      | Phantom and Solflare connect                  |
| Charts    | Recharts                   | Treasury and spend analytics                  |
| Forms     | React Hook Form and Zod    | Validation for onboarding and invoices        |

### Backend

| Layer      | Technology              | Purpose                                    |
| ---------- | ----------------------- | ------------------------------------------ |
| API server | Next.js API routes      | REST endpoints for platform operations     |
| Database   | PostgreSQL via Supabase | Contractors, invoices, payouts, audit logs |
| ORM        | Prisma                  | Type-safe database access                  |
| Auth       | Supabase Auth or Clerk  | Multi-tenant authentication                |
| Job queue  | BullMQ with Redis       | Async payout jobs and webhook processing   |
| Storage    | Supabase Storage        | Invoice PDFs and export files              |

### Blockchain and Solana

| Layer     | Technology                            | Purpose                              |
| --------- | ------------------------------------- | ------------------------------------ |
| Network   | Solana devnet or mainnet-beta         | USDC settlement                      |
| Token     | USDC (SPL Token)                      | Stablecoin for payouts               |
| SDK       | @solana/web3.js and @solana/spl-token | Wallet and transfer instructions     |
| Contracts | Anchor                                | Escrow vaults and batch payout logic |
| RPC       | Helius or QuickNode                   | Reliable RPC and webhooks            |

### Dodo billing

| Feature       | Dodo capability  | Implementation                           |
| ------------- | ---------------- | ---------------------------------------- |
| Subscriptions | Subscription API | Plan management and upgrades             |
| Usage billing | Metered billing  | Report usage units per payout or invoice |
| Checkout      | Hosted checkout  | Onboarding checkout flow                 |
| Webhooks      | Webhook events   | Update account status on payment events  |

### Infrastructure

| Layer      | Technology                    | Purpose                        |
| ---------- | ----------------------------- | ------------------------------ |
| Hosting    | Vercel plus Railway or Render | Frontend, API, and workers     |
| Monitoring | Sentry and Axiom              | Errors and logs                |
| CI/CD      | GitHub Actions                | Lint, test, and deploy on main |
| Secrets    | Vercel env vars or Doppler    | Secure configuration           |

## Architecture and ownership

The repo uses the Next.js App Router for UI and API routes, with a shared lib layer for services, integrations, and data access. Each team member owns a vertical slice.

| Member | Focus area                          | Primary ownership                                                                          |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| M1     | Business dashboard and Dodo billing | app/(dashboard), api/billing, lib/integrations/dodo, billing.service.ts                    |
| M2     | Contractor portal and invoices      | app/(contractor), api/contractors, api/invoices, invoice.service.ts, contractor.service.ts |
| M3     | Solana payout engine                | lib/solana, api/payouts, payout.service.ts, webhooks/helius                                |
| M4     | Compliance and infrastructure       | app/(compliance), api/audit, prisma, tests, db/queries                                     |

## API endpoints

| Method | Path                      | Owner    | Description                                       |
| ------ | ------------------------- | -------- | ------------------------------------------------- |
| POST   | /api/auth/signup          | M4       | Create company account and initiate Dodo checkout |
| GET    | /api/treasury/balance     | M1       | Fetch USDC balance from Solana RPC                |
| GET    | /api/contractors          | M1       | List all contractors for a company                |
| POST   | /api/contractors          | M2       | Onboard a new contractor                          |
| GET    | /api/invoices             | M2       | List invoices scoped to company or contractor     |
| POST   | /api/invoices             | M2       | Create a new invoice                              |
| PATCH  | /api/invoices/:id/approve | M2       | Approve an invoice and trigger payout             |
| PATCH  | /api/invoices/:id/reject  | M2       | Reject an invoice with reason                     |
| POST   | /api/payouts/execute      | M3       | Execute Solana USDC payout for an invoice         |
| GET    | /api/payouts              | M3 or M4 | List payouts with tx signatures                   |
| POST   | /api/webhooks/dodo        | M1       | Handle Dodo billing webhook events                |
| POST   | /api/webhooks/helius      | M3       | Handle Helius Solana webhook events               |
| GET    | /api/audit/export         | M4       | Download payout audit trail as CSV                |
| POST   | /api/billing/report-usage | M1       | Report usage event to Dodo API                    |

## Database schema (Supabase)

| Table          | Key columns                                                                                      | Notes                          |
| -------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| companies      | id, name, dodo_customer_id, dodo_subscription_id, treasury_wallet_address, plan_tier, created_at | One row per company            |
| contractors    | id, company_id, name, country, tax_id, payout_preference, wallet_address, kyc_status, created_at | FK to companies                |
| invoices       | id, contractor_id, company_id, amount_usdc, status, invoice_hash, submitted_at, approved_at      | Invoice lifecycle              |
| payouts        | id, invoice_id, contractor_id, amount_usdc, solana_tx_signature, status, executed_at             | Payout record per invoice      |
| usage_events   | id, company_id, event_type, dodo_event_id, reported_at                                           | Usage reporting log            |
| audit_logs     | id, company_id, action, actor_id, metadata, created_at                                           | Immutable audit trail          |
| webhook_events | id, source, event_id, payload, processed_at                                                      | Idempotency store for webhooks |

## Environment variables

Do not commit real secrets. Use Vercel or Doppler for production secrets.

| Variable                      | Owner | Description                                            |
| ----------------------------- | ----- | ------------------------------------------------------ |
| NEXT_PUBLIC_SUPABASE_URL      | M4    | Supabase project URL                                   |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | M4    | Supabase anon key for client-side auth                 |
| SUPABASE_SERVICE_ROLE_KEY     | M4    | Server-side Supabase admin access                      |
| DATABASE_URL                  | M4    | PostgreSQL connection string for Prisma                |
| DODO_API_KEY                  | M1    | Dodo secret API key for billing operations             |
| DODO_WEBHOOK_SECRET           | M1    | Dodo webhook signature verification secret             |
| SOLANA_RPC_URL                | M3    | Helius or QuickNode RPC endpoint                       |
| TREASURY_WALLET_SECRET_KEY    | M3    | Base58 private key for platform treasury (devnet only) |
| HELIUS_WEBHOOK_SECRET         | M3    | Helius webhook auth header value                       |
| RESEND_API_KEY                | M2    | Email delivery API key for notifications               |
| NEXT_PUBLIC_SOLANA_NETWORK    | M3    | devnet or mainnet-beta                                 |
| SENTRY_DSN                    | M4    | Sentry error tracking DSN                              |

## Verification checklist

- Escrow deposit and approval releases USDC to contractor in devnet.
- Batch payout of multiple contractors completes in a single transaction.
- Dodo checkout creates a subscription and usage events appear in Dodo.
- Invoice approve and reject update status and notify contractor.
- Audit export produces valid CSV with Solana Explorer links.
- CI pipeline is green on main.

## Risks and mitigations

| Risk                         | Mitigation                                         |
| ---------------------------- | -------------------------------------------------- |
| Solana RPC rate limits       | Use paid RPC and retry with backoff                |
| Escrow contract bug          | Extensive devnet testing and admin escape hatch    |
| Webhook delivery failure     | Idempotent handler and retry queue                 |
| Silent USDC transfer failure | Wait for finalized confirmation and verify balance |

## Recommended sprint plan

| Sprint   | Focus         | Milestone                                                              |
| -------- | ------------- | ---------------------------------------------------------------------- |
| Sprint 0 | Setup         | Repo init, Supabase schema, env vars, Vercel deploy, Anchor workspace  |
| Sprint 1 | Core flows    | Dashboard skeleton, contractor onboarding, escrow contract, CI and RLS |
| Sprint 2 | Integration   | Usage billing, approval flow, batch payout API, audit export           |
| Sprint 3 | Polish and QA | E2E testing, FX panel, split settlements, demo prep                    |

## Glossary

| Term             | Definition                                   |
| ---------------- | -------------------------------------------- |
| USDC             | USD Coin stablecoin on Solana                |
| SPL Token        | Solana Program Library token standard        |
| Escrow vault     | On-chain account holding USDC until approval |
| Dodo             | Billing and monetization platform            |
| Anchor           | Rust framework for Solana programs           |
| Devnet           | Solana public test network                   |
| RLS              | Row-Level Security in Supabase               |
| Split settlement | One payment routed to multiple recipients    |
| Proof of payment | Solana transaction signature proving payout  |
| Helius           | Solana RPC provider with webhooks            |

## Repository status

This repository currently contains a placeholder folder structure and responsibility comments in each file so the team can start parallel implementation.
