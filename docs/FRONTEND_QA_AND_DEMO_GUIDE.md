# Frontend QA and Demo Guide

## Purpose

This document is the single manual QA, UAT, and investor-demo guide for the Borderless Payroll Copilot project in this repository. It is written for judges, investors, enterprise reviewers, QA testers, and demo operators who need to verify the production-style frontend against the real backend, database, Solana escrow program, and webhook integrations.

This guide is based on the current repository implementation as of `2026-05-12`.

## Scope

The application under test includes:

- Next.js 14 App Router frontend
- Prisma + Postgres persistence
- Supabase JWT-based authentication
- Solana devnet USDC treasury and escrow flows
- Anchor escrow program
- Dodo checkout and webhook processing
- Helius treasury webhook processing
- Batch payouts
- Split settlements
- Treasury reconciliation
- Audit export and operational recovery views

## Critical implementation notes

These are important for accurate UAT:

- The `/dashboard` invoice `Approve` action does not only mark an invoice approved. In the current build it immediately executes the escrow-backed payout and returns the invoice as `PAID`.
- The dashboard wallet button is currently a wallet setup placeholder. It shows connection state from provider context, but clicking the main button triggers an alert saying wallet adapter setup is not installed in this environment. Treat wallet QA as a readiness and UX verification item unless a live adapter is wired before the demo.
- Admin APIs expect an admin bearer token in the `Authorization` header. The frontend helper reads this from `localStorage` or `sessionStorage` key `bp_access_token`.
- Contractor pages rely on a valid Supabase browser session and JWT claims containing `contractorId`.

---

## 1. Project Startup Checklist

### 1.1 Required prerequisites

Before starting the application, confirm all of the following exist:

- Node.js 18+ and npm
- Postgres database reachable from `DATABASE_URL`
- Supabase project with:
  - browser URL
  - anon key
  - service role key
  - users configured for admin and contractor testing
- Solana devnet treasury wallet funded with SOL and devnet USDC
- Deployed/available Anchor escrow program ID
- Dodo API key and webhook secret
- Helius webhook secret
- Optional but recommended: a public tunnel for webhook testing via `ngrok`

### 1.2 Required environment variables

Copy `.env.example` to `.env` and populate at minimum:

```bash
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
DATABASE_URL=...
DIRECT_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_URL=...
SOLANA_RPC_URL=https://api.devnet.solana.com
DEVNET_USDC_MINT=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
TREASURY_WALLET_SECRET_KEY=...
TREASURY_WALLET_ADDRESS=...
TREASURY_WALLET_WHITELIST=...
ESCROW_PROGRAM_ID=...
ALLOWED_ESCROW_PROGRAM_IDS=...
DODO_API_KEY=...
DODO_WEBHOOK_SECRET=...
HELIUS_WEBHOOK_SECRET=...
APP_ORIGIN=http://localhost:3000
APP_BASE_URL=http://localhost:3000
RESEND_API_KEY=...
NEXT_PUBLIC_JUDGE_MODE=true
JUDGE_MODE=true
```

### 1.3 Install and bootstrap

Run the following from the repository root:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

If you are using a fresh local development database instead of an already-migrated shared database:

```bash
npx prisma migrate dev
```

Optional validation commands already used in backend certification:

```bash
npm run phase4:validate-anchor
npm run phase4:live-payroll
npm run phase4:batch
npm run phase4:split
npm run phase4:dodo
npm run phase4:helius
```

### 1.4 Expected startup outcome

Expected successful outcomes:

- `npm install` completes without dependency errors.
- `npx prisma generate` completes successfully.
- migrations apply successfully with no Prisma schema drift.
- `npm run dev` starts Next.js on `http://localhost:3000`.
- `GET /api/health` returns a healthy JSON response.

### 1.5 Required supporting services

The following must already be live and valid before manual QA:

- Postgres
- Supabase Auth
- Solana devnet RPC
- treasury wallet with SOL for fees
- treasury wallet ATA holding USDC
- deployed escrow program matching `ESCROW_PROGRAM_ID`
- Dodo webhook endpoint configuration
- Helius webhook endpoint configuration

### 1.6 ngrok requirements

Use ngrok when testing external webhooks against local Next.js:

```bash
.\ngrok.exe http 3000
```

Configure webhook targets using the ngrok HTTPS URL:

- `https://<ngrok-id>.ngrok-free.app/api/webhooks/dodo`
- `https://<ngrok-id>.ngrok-free.app/api/webhooks/helius`

### 1.7 Solana devnet requirements

Confirm:

- `NEXT_PUBLIC_SOLANA_NETWORK=devnet`
- treasury wallet has devnet SOL
- treasury wallet has devnet USDC
- contractor wallet test addresses are valid Solana public keys
- `ESCROW_PROGRAM_ID` is allowlisted in `ALLOWED_ESCROW_PROGRAM_IDS`

### 1.8 Screenshot placeholder

> Screenshot placeholder: terminal showing successful `npm run dev`, Prisma generation, and the app loading on `http://localhost:3000`.

---

## 2. Authentication Testing

### 2.1 What to test

Routes relevant to auth verification:

- `/`
- `/dashboard`
- `/contractor`
- `/contractor/invoices/new`
- `/operations`
- `/enterprise-admin`

### 2.2 Signup and login verification

Current implementation note:

- The repo includes `POST /api/auth/signup`.
- The frontend does not currently expose a dedicated branded login page in `app/`; browser session testing is performed through Supabase-authenticated sessions and stored JWTs.

Manual steps:

1. Create or use an admin Supabase user.
2. Create or use a contractor Supabase user.
3. Ensure `company_user` contains a row mapping the admin `userId` to a company.
4. Ensure contractor JWT metadata contains `contractorId`.
5. Acquire a valid admin bearer token and store it in the browser:

```js
localStorage.setItem("bp_access_token", "<admin-access-token>")
```

6. Open `/dashboard` and `/operations`.
7. Open a separate browser profile for the contractor and authenticate with Supabase session.
8. Open `/contractor` and `/contractor/invoices/new`.

### 2.3 Admin access verification

Expected result:

- `/dashboard`, `/compliance`, `/operations`, `/enterprise-admin`, and `/api/treasury/balance` work only with admin role plus company membership.
- Without admin role, protected admin routes return `401` or `403`.

### 2.4 Contractor access verification

Expected result:

- contractor can load `/contractor`
- contractor can submit invoice via `/contractor/invoices/new`
- contractor can only see their own invoices
- contractor cannot access admin-only actions such as batch payout, treasury balance, compliance export, or recovery actions

### 2.5 Session persistence

Expected result:

- contractor session persists across refresh through Supabase browser session
- admin API access persists while `bp_access_token` remains in storage
- expired JWTs must fail with `JWT has expired.`

### 2.6 Expected backend behavior

- JWT signature validated against Supabase JWKS
- issuer and time claims validated
- membership looked up in `CompanyUser`
- admin role resolved from JWT metadata

### 2.7 Expected database behavior

Verify:

- `CompanyUser` row exists for admin
- contractor record exists and maps to company
- no unauthorized cross-company access occurs

### 2.8 Screenshot placeholder

> Screenshot placeholder: admin dashboard opened successfully and contractor portal opened in a separate session.

---

## 3. Wallet Connection Testing

### 3.1 Page and component under test

- `/dashboard`
- `WalletConnect` component in top action bar

### 3.2 What to click

On `/dashboard`:

- click `Wallet Adapter Setup`

### 3.3 Current expected behavior in this repo

Current build expectation:

- a badge should show either `Wallet disconnected` or a connected wallet badge if provider state is injected
- clicking the button currently shows an alert:

```text
Wallet adapter package is not installed in this environment. Configure adapter dependencies to enable live wallet connect UI.
```

### 3.4 Wallet persistence verification

Because the button is currently a placeholder, treat this as a readiness check:

- if provider state is mocked or externally configured, verify the badge remains connected after refresh
- if no adapter is configured, record as known limitation, not as a backend failure

### 3.5 Treasury wallet visibility

Verify on `/dashboard`:

- treasury wallet is visible in the Treasury Panel
- copy button copies the wallet address
- explorer icon opens:

```text
https://explorer.solana.com/address/<TREASURY_WALLET_ADDRESS>?cluster=devnet
```

### 3.6 Contractor wallet verification

Verify from contractor data:

- contractors with `USDC` payout preference must have `walletAddress`
- contractor invoice approval fails if wallet is missing

Expected backend failure message:

```text
Contractor wallet address is missing.
```

### 3.7 Screenshot placeholder

> Screenshot placeholder: dashboard wallet area showing disconnected or connected status, plus treasury wallet explorer link.

---

## 4. Dashboard Testing

### 4.1 Page under test

- `/dashboard`

### 4.2 Exact areas to verify

- top hero badges
- `Wallet Adapter Setup`
- `Sync rates`
- `Top Up Treasury`
- `Run judge demo`
- Judge Demo panel if `NEXT_PUBLIC_JUDGE_MODE=true`
- metric cards
- Treasury Panel
- Contractor Roster
- Invoice Queue
- Payout Queue
- FX Visibility

### 4.3 Metrics loading

Expected frontend behavior:

- cards render with skeletons first, then live values
- treasury balance card shows a `LIVE` badge when `/api/treasury/balance` succeeds
- if RPC fails, cached balance is shown and error source is visible

Expected backend behavior:

- `/api/treasury/balance` fetches live USDC ATA balance from Solana
- company `treasuryBalanceUsdc` and `treasuryBalanceUpdatedAt` are updated on success

### 4.4 Treasury balance visibility

Verify:

- wallet address truncates visually
- copy button works
- explorer link opens correct address on Solana explorer
- top-up modal shows QR placeholder and raw address

### 4.5 Payout metrics

Verify:

- `Pending Invoices` count equals pending rows
- `This Month Spend` equals sum of paid invoices shown by API
- `Policy automation` card renders approval percentage

### 4.6 Charts and feed

Verify:

- sparkline renders in `This Month Spend`
- FX cards refresh
- values remain readable on desktop and mobile

Note:

- there is no dedicated “recent activity feed” widget in the current dashboard build; operational activity is represented through invoice queue, payout queue, judge demo log, and treasury panel.

### 4.7 Screenshot placeholder

> Screenshot placeholder: full dashboard with metrics, treasury panel, contractor roster, invoice queue, payout queue, and FX panel.

---

## 5. Invoice Workflow Testing

### 5.1 Pages under test

- `/contractor/invoices/new`
- `/contractor`
- `/dashboard`

### 5.2 Create invoice

Open `/contractor/invoices/new` and verify:

- `Start Date`
- `End Date`
- line item description
- quantity
- unit price
- `Add line item`
- `Cancel`
- `Submit Invoice - $<amount> USDC`

Manual test cases:

1. Create one valid line item.
2. Create multiple line items.
3. Set end date earlier than start date.
4. Set quantity `0`.
5. Leave description blank.
6. Tamper client request so `amountUsdc` does not equal line item sum.

Expected frontend behavior:

- inline validation errors appear before submit
- total updates live
- success state shows `Invoice Submitted`
- redirect returns to `/contractor?submitted=1`

Expected backend behavior:

- `POST /api/invoices` validates dates, line items, total cross-check, and contractor scope
- invoice is stored with `PENDING` status
- SHA-256 `invoiceHash` is computed and persisted

Expected DB behavior:

- new `Invoice` row created
- fields populated:
  - `companyId`
  - `contractorId`
  - `amountUsdc`
  - `status=PENDING`
  - `invoiceHash`
  - `submittedAt`
  - `notes` if provided

### 5.3 Approve invoice

Open `/dashboard` -> `Invoice Queue` -> `Pending` tab.

Click:

- `Approve`

Current build expectation:

- approval immediately runs payout execution
- invoice transitions directly to `PAID`
- payout is created and confirmed if Solana flow succeeds

Expected backend behavior:

- `PATCH /api/invoices/[id]/approve`
- validates invoice belongs to admin company
- validates status in `PENDING` or `APPROVED`
- validates contractor wallet exists
- executes escrow initialize, deposit, release
- creates or updates `Payout`
- returns `explorerUrl`

Expected DB behavior:

- `Payout.status=CONFIRMED`
- `Payout.txSignature=<solana signature>`
- `Payout.escrowPda=<derived pda>`
- `Payout.executedAt` populated
- `Invoice.status=PAID`
- `Invoice.approvedAt` populated
- `AuditLog` includes `payout_confirmed`

### 5.4 Reject invoice

Click:

- `Reject`
- enter reason in `Reject Invoice` dialog
- click `Reject invoice`

Expected frontend behavior:

- reject button disabled until reason entered
- toast shows `Invoice rejected with reason saved.`

Expected backend behavior:

- `PATCH /api/invoices/[id]/reject`
- invoice must still be `PENDING`
- rejection reason must be present and <= 1000 chars
- rejection email attempted via Resend

Expected DB behavior:

- `Invoice.status=REJECTED`
- `Invoice.rejectionReason` populated
- `AuditLog.action=INVOICE_REJECTED`
- no payout row created
- no Solana transaction sent

### 5.5 Invoice status transitions

Expected lifecycle in this build:

- `PENDING` -> `PAID` when admin approves from dashboard
- `PENDING` -> `REJECTED` when admin rejects

Historical/support states also valid in persistence:

- `PENDING`
- `APPROVED`
- `REJECTED`
- `PAID`

### 5.6 Screenshot placeholder

> Screenshot placeholder: contractor invoice form, dashboard approve/reject controls, and contractor invoice history after submission.

---

## 6. Escrow Testing

### 6.1 Trigger path

Primary path:

- `/dashboard` -> `Invoice Queue` -> `Approve`

### 6.2 Escrow initialization

Expected Solana sequence from current code:

1. `initializeEscrow({ invoiceId })`
2. `depositEscrow({ invoiceId, amount })`
3. `releaseEscrow({ invoiceId, contractorWallet })`

### 6.3 Expected transaction signatures

For a successful live run, expect:

- initialize signature
- deposit signature
- release signature

The payout API returns the release signature as final proof.

Reference explorer sample from repo artifact:

- initialize: `https://explorer.solana.com/tx/2XzTafa6HmnmUXYgWCMMAYPJ9EdHQaREta9VVjpBiXKP1foArkd7FsSeHaJ1ZiDqPrgaqh6nBf7zcQeL2H8Cwsux?cluster=devnet`
- deposit: `https://explorer.solana.com/tx/MAm74QADMRicchAgGRmDQ5kEUC6dGuyc5LAy1oRFsZb16ExGinp4QCMejqnuB5kqtregWEtcpzcDVhkkDFjygui?cluster=devnet`
- release: `https://explorer.solana.com/tx/2hPPV9yrjwF3y2wiYLJ18g8gbecwZvycgfK4nE7vvMwqtpcP8b9DLi3ABj5aJ5RCzdUj6LhaA1PQ3PSvHzCMUBv7?cluster=devnet`

### 6.4 Explorer verification

For the final release signature, verify:

- transaction status is finalized
- token movement matches invoice amount
- recipient ATA received USDC

Use:

```text
https://explorer.solana.com/tx/<tx-signature>?cluster=devnet
```

### 6.5 PDA expectations

Escrow PDA is derived from:

- seed `"escrow"`
- treasury public key
- normalized `invoiceId` bytes

Expected result:

- each invoice maps deterministically to one escrow PDA
- same invoice cannot create multiple confirmed payouts

Sample escrow PDA artifact:

- `https://explorer.solana.com/address/ARrKN3heJ628q5pxnTenbuuww2NKxZGhLd8BtnyGGBbP?cluster=devnet`

### 6.6 Vault ATA expectations

Expected:

- vault ATA is associated token account owned by escrow PDA
- vault mint equals configured devnet USDC mint
- vault owner is SPL Token Program

### 6.7 Expected DB behavior

- `Payout.escrowPda` persisted
- final `txSignature` equals release signature
- invoice becomes `PAID`

### 6.8 Audit expectations

Expected audit records after successful escrow-backed payout:

- `INVOICE_APPROVED`
- `payout_confirmed`

Reference sample from repo artifact:

```json
{
  "action": "INVOICE_APPROVED"
}
```

```json
{
  "action": "payout_confirmed"
}
```

### 6.9 Screenshot placeholder

> Screenshot placeholder: dashboard approve action, returned explorer link, and Solana explorer transaction details.

---

## 7. Payroll Execution Testing

### 7.1 Primary route

- `/dashboard`

### 7.2 Live payroll path

Manual steps:

1. create a contractor invoice
2. approve from dashboard
3. observe invoice leaving pending queue
4. observe contractor invoice history
5. inspect payout in compliance export

Expected frontend behavior:

- success toast after payout
- invoice disappears from `Pending`
- contractor portal shows explorer link once payout exists

### 7.3 Contractor payout visibility

On `/contractor`, verify:

- paid invoice appears in history
- `View on Explorer` link exists when `solanaTxSignature` exists
- approved date and submitted date render correctly

### 7.4 Payout status updates

Expected:

- payout created as `PENDING`
- updated to `CONFIRMED` after finalized transaction
- invoice set to `PAID`

### 7.5 Reconciliation validation

Successful case:

- no critical reconciliation warning should remain open for the payout

Failure case:

- `ReconciliationAudit` row should be created with `PAYOUT_FAILURE` or `PAYOUT_DB_CONFIRMATION_FAILURE`

### 7.6 Screenshot placeholder

> Screenshot placeholder: contractor portal invoice history showing a paid invoice and explorer link.

---

## 8. Batch Payout Testing

### 8.1 Page and button

- `/dashboard`
- `Payout Queue`
- `Execute Batch Payout`

### 8.2 Multi-recipient payout test

Prepare at least 2 to 5 approved invoices with valid contractor wallets.

Click:

- `Execute Batch Payout`

Expected backend behavior:

- `POST /api/payouts/batch`
- requires admin auth
- requires all selected invoices belong to same company
- requires all selected invoices `APPROVED`
- creates `Payout` rows as `PENDING`
- sends a single atomic Solana transaction
- updates all payouts to `CONFIRMED`
- updates all invoices to `PAID`

### 8.3 Transaction batching expectations

Expected:

- one transaction signature for all recipients in that batch
- max 10 recipients per batch in current implementation
- missing ATAs are created inside the same transaction if needed

### 8.4 Recipient balance verification

Verify on explorer and/or token accounts:

- every recipient ATA increases by the expected amount
- treasury ATA decreases by total batch amount plus negligible fee impact in SOL

Reference batch artifact:

- explorer URL:
  `https://explorer.solana.com/tx/4MfW5W3dWAbWz37BcDafG6brucjdE8dee2qigmRLwTTLSaPd2dpTejkjRR8ApxGUkVpmrLhuo9hhM57GhEgEtwTj?cluster=devnet`

Reference validated outcome from artifact:

- 5 recipients
- `0.02 USDC` each
- treasury delta `0.10 USDC`

### 8.5 Audit persistence

Verify:

- `Payout` rows exist for all invoice IDs
- same `txSignature` appears across that batch
- reconciliation record may be created as operational evidence

### 8.6 Screenshot placeholder

> Screenshot placeholder: payout queue before execution and compliance records after a successful batch payout.

---

## 9. Split Settlement Testing

### 9.1 Scope

Split settlement is currently validated through backend flow rather than a dedicated frontend page, but it remains part of end-to-end product verification.

### 9.2 Expected routing

For total amount `X`:

- contractor receives `95%`
- fee wallet receives `5%`

### 9.3 Validation steps

1. execute split settlement flow with configured contractor and fee wallets
2. inspect explorer transaction
3. verify recipient balances before and after

Reference split artifact:

- explorer URL:
  `https://explorer.solana.com/tx/4XkBwu4UuVk8kYLb2vh6wAJn4ZjqtqNiqeDEZjVd1czjZtekkNoKqpWzV5zgZrpeZxAkifnyEnNeqnZ5JEp4Jyhf?cluster=devnet`

### 9.4 Expected balance example

Reference validated result from artifact for `0.10 USDC`:

- contractor delta: `0.095 USDC`
- fee wallet delta: `0.005 USDC`
- treasury delta: `0.10 USDC`

### 9.5 Explorer verification

Verify a single finalized transaction with:

- one transfer to contractor ATA
- one transfer to fee ATA

### 9.6 Screenshot placeholder

> Screenshot placeholder: split settlement explorer transaction showing two outbound token transfers.

---

## 10. Treasury Monitoring Testing

### 10.1 Pages under test

- `/dashboard`
- `/operations`
- `/enterprise-admin`

### 10.2 Treasury balance updates

On `/dashboard`:

- verify balance loads from `/api/treasury/balance`
- verify source badge indicates live or cached data

### 10.3 Helius webhook behavior

Deliver a valid Helius webhook to:

```text
/api/webhooks/helius
```

Expected behavior:

- shared secret verified from header
- webhook freshness / nonce protections applied
- treasury transfer persisted
- company balance updated

Reference Helius validation artifact:

- explorer URL:
  `https://explorer.solana.com/tx/3iyKA5LDcbyb4rAqK8iRnkTBcqazdnnpUoB9Lgg21gNtrdhiMWd4eW3tEq8z5jo4a4y76Lm2PNebEyssrQjzKGY6?cluster=devnet`

### 10.4 Treasury transaction persistence

Expected DB behavior:

- `TreasuryTransaction.signature` unique
- `walletAddress` matches company treasury wallet
- `direction` is `INCOMING` or `OUTGOING`
- `amountUsdc` populated
- `slot` populated when provided

### 10.5 Reconciliation expectations

Successful case:

- `/operations` shows treasury metrics in sync

Failure case:

- `ReconciliationAudit` can capture treasury mismatch warnings

### 10.6 Screenshot placeholder

> Screenshot placeholder: operations page treasury metrics and a persisted treasury transaction entry.

---

## 11. Dodo Billing Testing

### 11.1 Pages and routes under test

- `/onboarding`
- `/api/billing/checkout`
- `/api/webhooks/dodo`

### 11.2 Checkout creation

On `/onboarding` step 2, click one of:

- `Starter`
- `Growth`
- `Enterprise`

Expected frontend behavior:

- click triggers `api.checkout(tier)`
- toast shows `Dodo checkout ready for <tier>.`
- browser redirects to hosted checkout URL

Expected backend behavior:

- `POST /api/billing/checkout`
- calls `createCheckoutSession`
- returns:
  - `url`
  - `customerId`
  - `subscriptionId`

### 11.3 Webhook processing

Deliver signed webhook to:

```text
/api/webhooks/dodo
```

Expected behavior:

- signature verification succeeds
- webhook event stored once
- billing event upserted
- company subscription fields updated

### 11.4 Replay and idempotency verification

Expected:

- replaying the same `externalId` returns success
- no duplicate `WebhookEvent`
- no duplicate `BillingEvent`

Reference validation artifact outcome:

- first signed webhook: `200`
- replay webhook: `200`
- `webhookCount = 1`
- `billingCount = 1`

### 11.5 Billing persistence expectations

Verify:

- `WebhookEvent.provider = dodo`
- `WebhookEvent.processed = true`
- `BillingEvent.dodoPaymentId` unique
- `Company.dodoCustomerId` updated
- `Company.dodoSubscriptionId` updated
- `Company.planTier` updated

### 11.6 Screenshot placeholder

> Screenshot placeholder: onboarding pricing step, Dodo redirect, and billing webhook verification evidence.

---

## 12. Audit and Compliance Testing

### 12.1 Pages and actions

- `/compliance`
- `/operations`
- `/enterprise-admin`
- `/api/audit/export`

### 12.2 Audit export

On `/compliance`, test:

- date filters
- search box
- KYC status filter
- `Export CSV`

Expected behavior:

- CSV download starts
- filename format includes date
- export works for payouts and admin audit types

### 12.3 Explorer links

Verify on `/compliance`:

- each payout row has explorer link
- clicking opens correct Solana devnet transaction

### 12.4 Transaction signature visibility

Verify:

- payout rows show `txHash`
- operations reconciliation can show `txSignature`
- contractor portal shows explorer links for paid invoices

### 12.5 Payout traceability

For a paid invoice, reviewers should be able to trace:

1. invoice row
2. payout row
3. audit log
4. explorer transaction
5. treasury delta

### 12.6 Treasury transaction traceability

For treasury movement, reviewers should be able to trace:

1. treasury webhook delivery
2. treasury transaction row
3. updated company treasury balance
4. operations metrics

### 12.7 Expected audit records

Common expected actions:

- `signup_created`
- `INVOICE_APPROVED`
- `INVOICE_REJECTED`
- `payout_confirmed`
- `payout_failed`
- `audit_exported`

### 12.8 Screenshot placeholder

> Screenshot placeholder: compliance payout ledger, CSV export, and explorer link opened for one paid transaction.

---

## 13. Mobile Responsiveness Testing

### 13.1 Pages to test

- `/`
- `/onboarding`
- `/dashboard`
- `/contractor`
- `/contractor/invoices/new`
- `/compliance`
- `/analytics`

### 13.2 Mobile checks

Verify on common viewport widths such as `390x844` and `768x1024`:

- navigation remains usable
- cards stack cleanly
- forms do not clip
- dialogs fit the viewport
- tables remain horizontally scrollable
- wallet section does not overlap other controls
- charts remain readable

### 13.3 Specific components to inspect

- dashboard top action bar
- invoice rejection dialog
- top-up treasury dialog
- contractor invoice line-item grid
- compliance table filters

### 13.4 Screenshot placeholder

> Screenshot placeholder: dashboard and contractor invoice form rendered on mobile viewport.

---

## 14. Error-State Testing

### 14.1 Invalid invoice

Test cases:

- blank description
- zero quantity
- end date before start date
- amount tampering between UI total and payload total

Expected result:

- client validation blocks obvious errors
- API returns `400` with explicit message for payload tampering

### 14.2 Insufficient treasury funds

Force treasury USDC below payout amount, then approve or batch pay.

Expected result:

- Solana transfer layer throws insufficient balance error
- payout marked `FAILED`
- reconciliation audit written
- UI shows failure toast or API error

### 14.3 Invalid wallet

Use malformed contractor wallet.

Expected result:

- API returns wallet validation error
- no payout confirmed
- no invoice marked paid

### 14.4 Webhook replay

Test both:

- same Dodo event replay
- same Helius nonce replay

Expected result:

- Dodo replay remains idempotent and accepted
- Helius nonce replay rejected with `400`

### 14.5 Expired session

Use expired or removed token.

Expected result:

- protected routes fail with auth error
- contractor page shows auth failure state
- admin APIs return `401`

### 14.6 RPC failure handling

Simulate invalid or unavailable RPC.

Expected result:

- treasury balance endpoint falls back to cached balance with `source=cache`
- payout execution fails cleanly
- no false “paid” state without confirmed chain result

### 14.7 Screenshot placeholder

> Screenshot placeholder: visible error message for invalid invoice, expired session, and payout/RPC failure case.

---

## 15. Final Demo Walkthrough

This is the recommended investor/judge flow.

### 15.1 Pre-demo setup

Before the audience joins:

- start app
- confirm admin token in browser storage
- confirm contractor Supabase session works
- confirm treasury funded
- confirm ngrok active if showing live webhooks
- confirm `NEXT_PUBLIC_JUDGE_MODE=true`

### 15.2 Demo sequence

1. Open `/dashboard`.
2. Show live treasury balance and explorer link.
3. Open `/contractor/invoices/new`.
4. Create a realistic invoice with 1 to 2 line items and submit it.
5. Return to `/contractor` and show invoice as pending.
6. Open `/dashboard` and show invoice in `Pending`.
7. Click `Approve`.
8. Show success and open returned Solana explorer transaction.
9. Open `/contractor` and show invoice now reflects on-chain payout history.
10. Open `/compliance` and export CSV.
11. Open `/operations` and show health, webhook, and reconciliation panels.
12. If desired, open `/onboarding` and show Dodo checkout entrypoint.
13. If live webhook demo is prepared, replay Dodo or Helius webhook evidence through operations or admin evidence views.

### 15.3 Optional judge-mode shortcuts

If enabled, the dashboard `Judge Demo` panel can be used to:

- `Seed Demo Data`
- `Submit Invoice`
- `Approve + Release Escrow`
- `Download Audit CSV`

Use this only if you need a controlled fallback path.

### 15.4 Screenshot placeholder

> Screenshot placeholder: end-to-end demo sequence from dashboard to contractor portal to explorer to compliance export.

---

## 16. Expected Successful Demo Outcome

The demo is successful if it proves all of the following:

### 16.1 Frontend and backend integration

- frontend actions invoke real API routes
- admin and contractor experiences behave differently based on role
- invoice lifecycle is persisted correctly

### 16.2 Blockchain integration

- treasury balance is read from Solana devnet
- invoice approval results in escrow initialize, deposit, and release
- final transaction is visible on Solana explorer

### 16.3 Webhook integration

- Dodo webhook signature verification works
- Helius webhook secret verification works
- idempotency and replay protections behave correctly

### 16.4 Stablecoin settlement

- contractor receives USDC on devnet
- batch payouts settle multiple recipients atomically
- split settlement routes 95% and 5% correctly

### 16.5 Programmable finance functionality

- treasury is monitored in real time
- payout execution is policy-aware and auditable
- compliance export links invoices, payouts, and chain evidence
- recovery and reconciliation tooling exists for enterprise operations

---

## Exact Pages to Test

Use this list as the page-level QA checklist:

- `/`
- `/onboarding`
- `/dashboard`
- `/contractor`
- `/contractor/invoices/new`
- `/compliance`
- `/analytics`
- `/operations`
- `/enterprise-admin`

---

## Explorer URL Templates

Use these URL templates during manual validation:

```text
https://explorer.solana.com/tx/<tx-signature>?cluster=devnet
https://explorer.solana.com/address/<wallet-or-pda>?cluster=devnet
```

---

## Troubleshooting Tips

- If `/dashboard` shows treasury errors, confirm the admin token is present and `TREASURY_WALLET_ADDRESS` belongs to the company row in Postgres.
- If contractor pages fail immediately, confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are populated and that the Supabase session contains `contractorId`.
- If admin APIs return `401` or `403`, confirm `CompanyUser.userId` matches the JWT subject and role metadata is `admin`.
- If approval fails, check contractor wallet validity, treasury USDC balance, and `ESCROW_PROGRAM_ID`.
- If Dodo webhook verification fails, confirm the `dodo-signature` header and `DODO_WEBHOOK_SECRET`.
- If Helius webhook verification fails, confirm the request includes `x-helius-webhook-secret` or bearer auth matching `HELIUS_WEBHOOK_SECRET`.
- If audit export fails in local mode, confirm the request includes `Authorization: Bearer <token>`.
- If wallet QA is blocked, record that the current `Wallet Adapter Setup` control is a placeholder in this repo build rather than a live Phantom connect button.

---

## Sign-off Criteria

Mark frontend UAT complete only when all of the following are true:

- app boots successfully from a clean environment
- admin flow works from dashboard through audit export
- contractor flow works from invoice submission through paid invoice visibility
- at least one escrow-backed payout is verified on Solana explorer
- at least one batch payout is verified
- at least one split settlement is verified
- at least one Dodo webhook and one Helius webhook are processed successfully
- audit and reconciliation evidence is visible in frontend or exported artifacts
