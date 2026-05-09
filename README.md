# Borderless Payroll Copilot

Borderless Payroll Copilot is a multi-tenant payroll and treasury app for finance admins paying global contractors: teams approve invoices, release USDC payouts, and export audit-ready records from one dashboard. Solana + USDC matters here because settlements are fast, low-cost, and verifiable on-chain, so judges can see real payout proof (transaction signatures) instead of simulated payment states.

## Live Demo Flow (Judge)

1. Set `NEXT_PUBLIC_JUDGE_MODE=true` (optional server override: `JUDGE_MODE=true`) in `.env`.
2. Open the admin dashboard and click **Seed Demo Data**.
3. Click **Approve + Release Escrow**.
4. Open the returned Solana transaction signature in Solana Explorer (devnet).
5. Click **Download Audit CSV**.

## Tech Stack

| Layer | Technology | Use in this project |
| --- | --- | --- |
| Web app | Next.js 14 (App Router) | Dashboard UI + API routes |
| Chain programs | Solana + Anchor | Escrow/payout program surface |
| Stablecoin rail | USDC (SPL Token) | Contractor payout asset |
| Billing | Dodo Payments | Checkout + metered usage reporting |
| Auth + Postgres | Supabase | JWT auth + hosted Postgres |
| ORM | Prisma | Type-safe DB access |
| Queue | BullMQ | Async worker queue layer (planned/scaffolded) |

## Local Setup

```bash
git clone https://github.com/DhruvPatel6429/Solana-Hackathon.git
cd Solana-Hackathon
npm install
cp .env.example .env
npx prisma generate
npx prisma db push
npm run dev
```

PowerShell copy command (if needed):

```powershell
Copy-Item .env.example .env
```

Required `.env` variables for local judge flow:

```env
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SOLANA_RPC_URL=https://api.devnet.solana.com
TREASURY_WALLET_SECRET_KEY=
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_JUDGE_MODE=true
```

Optional (but recommended / feature-specific):

```env
JUDGE_MODE=true
DODO_API_KEY=
DODO_WEBHOOK_SECRET=
RESEND_API_KEY=
HELIUS_WEBHOOK_SECRET=
ESCROW_PROGRAM_ID=
DIRECT_URL=
SENTRY_DSN=
```

## What's Real vs Demo Mode

| Surface | Behavior |
| --- | --- |
| Treasury balance | **Real** Solana devnet RPC call (`/api/treasury/balance`). |
| Invoice approval | **Real** SPL USDC transfer on devnet when approving invoices. |
| Dodo billing | **Live integration** when `DODO_API_KEY` is set; otherwise **sandbox/mock fallback** responses are used. |
| Email notifications | **Real** via Resend when `RESEND_API_KEY` is set; otherwise email is skipped (invoice state still updates). |

