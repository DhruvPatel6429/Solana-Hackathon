# Demo Script

## Title

**Borderless Payroll Copilot**

**Enterprise stablecoin payroll infrastructure on Solana**

---

## Demo Setup Notes

Use this script with the following pages prepared in advance:

- `/dashboard`
- `/contractor`
- `/contractor/invoices/new`
- `/compliance`
- `/operations`
- optional: `/onboarding`
- optional: `/enterprise-admin`

Recommended browser setup:

- one browser window logged in as admin
- one second window or profile logged in as contractor
- one Solana explorer tab ready
- one fallback tab on `/operations`

Recommended demo company narrative:

- Company name: `Northstar AI`
- Contractor name: `Maya Chen`
- Use case: global AI infrastructure company paying international contractors in USDC

---

## 1. Opening Hook (30–60 sec)

### Speaking script

"Every global company has the same payroll problem: paying contractors across borders is still slow, manual, expensive, and opaque.

Traditional payroll systems depend on banking rails that introduce settlement delays, FX spread, reconciliation overhead, and almost no real-time visibility.

Stablecoins change that, but just sending tokens is not enough. Enterprises do not just need transfers. They need programmable finance: approvals, escrow controls, treasury monitoring, audit trails, and operational recovery.

That is what we built: a production-grade stablecoin payroll platform on Solana that turns payroll into programmable infrastructure."

### Presenter notes

- pause after "just sending tokens is not enough"
- emphasize that the product is not a consumer crypto experience
- frame the product as enterprise operations, not speculation

### Audience engagement moment

Ask:

"How many of you would trust payroll with a wallet and a spreadsheet alone?"

Then answer:

"Exactly. Enterprises need controls, not just transactions."

---

## 2. Product Positioning

### Speaking script

"Borderless Payroll Copilot is built for internet-native companies, fintech operators, and global teams paying contractors across borders.

We use Solana because payroll needs low fees, high throughput, and fast finality. We use escrow because enterprises need payout control between invoice approval and final release. And we use auditability because finance teams need proof, not screenshots.

This platform gives companies one treasury, one approval layer, one payout engine, and a verifiable on-chain trail for every payroll action."

### Key points to say clearly

- this is for companies, not retail users
- Solana provides real settlement efficiency
- escrow creates programmable payout safety
- auditability creates enterprise trust

### Presenter notes

- keep this section concise
- transition naturally into dashboard

---

## 3. Live Demo Flow

## 3.1 Login

### Speaking script

"I’m going to walk through this as a real company operator.

Here I’m logged in as the finance admin for Northstar AI. In a separate view, I also have the contractor portal available so we can show both sides of the payroll experience."

### Frontend action

- open `/dashboard`
- briefly mention separate contractor session on `/contractor`

### Presenter notes

- do not spend time on raw auth mechanics
- just establish role-based access

---

## 3.2 Dashboard

### Speaking script

"This is the main treasury command center. From one place, the finance team can see treasury balance, contractor roster, invoice queue, payout queue, FX visibility, and operational status."

### Frontend action

On `/dashboard`, point to:

- Treasury Balance
- Active Contractors
- Pending Invoices
- This Month Spend
- Treasury Panel
- Contractor Roster
- Invoice Queue
- Payout Queue
- FX Visibility

### Technical talking point

"The dashboard is not just UI. These panels are backed by real API routes, Prisma persistence, treasury balance retrieval, and payout workflows."

---

## 3.3 Treasury Balance

### Speaking script

"The first thing a finance team needs is visibility into live treasury state. Here we show the company treasury wallet, live USDC balance, and direct explorer access."

### Frontend action

- point to Treasury Balance card
- open Treasury Panel
- click copy icon if useful
- click explorer icon for treasury wallet

### Blockchain verification moment

Say:

"This is the actual Solana devnet treasury address. We can open it directly in the explorer and verify the balance independently of the application."

### Presenter notes

- keep explorer load time short
- if explorer is slow, describe the address while tab loads

---

## 3.4 Create Contractor Invoice

### Speaking script

"Now let’s simulate a real payroll event. In the contractor portal, Maya Chen submits an invoice for completed work."

### Frontend action

- switch to `/contractor/invoices/new`
- fill:
  - Start Date
  - End Date
  - line item description
  - quantity
  - unit price
- click `Submit Invoice`

### Suggested invoice content

- description: `AI workflow implementation sprint`
- quantity: `1`
- unit price: use a realistic USDC amount such as `4200`

### Speaking while filling form

"The contractor experience is intentionally simple. They submit work details, the amount is calculated live, and the request enters an approval workflow instead of immediately pushing money out the door."

### Technical talking point

"On submission, the backend validates the payload, cross-checks the total against line items, scopes the invoice to the authenticated contractor, and persists a hashed invoice record."

---

## 3.5 Approve Invoice

### Speaking script

"Back in the admin dashboard, that invoice appears in the pending queue. This is where programmable payroll starts to matter."

### Frontend action

- switch to `/dashboard`
- find invoice under `Invoice Queue`
- click `Approve`

### Important repo-accurate line

"In this build, approval is wired directly to payout execution, so approving the invoice immediately triggers the escrow-backed payroll flow."

### Presenter notes

- say this clearly so judges understand this is intentional in the demo build
- do not describe it as a two-click process unless you are showing backend artifacts separately

---

## 3.6 Initialize Escrow

### Speaking script

"Behind this one button, the system creates a dedicated escrow account for that invoice. This is not just a status change in a database. We create a deterministic on-chain escrow PDA tied to the treasury and invoice identity."

### Technical talking point

"That PDA is derived from the escrow seed, the treasury authority, and the invoice identifier. That means every payroll event has a deterministic escrow destination that can be inspected and reconciled later."

### Presenter notes

- if not showing logs live, describe the sequence clearly
- mention deterministic address derivation

---

## 3.7 Fund Escrow

### Speaking script

"After initialization, USDC is deposited into the vault account associated with that escrow. This step matters because it separates treasury custody from recipient release conditions."

### Technical talking point

"The vault is an associated token account owned by the escrow PDA, and the mint is the configured devnet USDC mint. That gives us a real programmable holding layer before release."

---

## 3.8 Release Payroll

### Speaking script

"Once the payout conditions are satisfied, the escrow releases funds to the contractor wallet. That release produces a Solana transaction signature that becomes our source of truth for settlement."

### Frontend action

- after approval succeeds, reference success state
- if explorer URL is visible, open it

### Blockchain verification moment

Say:

"This is the exact transaction that released payroll on-chain. We can verify finality, token movement, and recipient destination independently in the Solana explorer."

---

## 3.9 Contractor Payout Visibility

### Speaking script

"Now we switch back to the contractor perspective. The contractor sees invoice history, status progression, and proof of payment without having to ask finance for a wire confirmation."

### Frontend action

- switch to `/contractor`
- show paid invoice
- click `View on Explorer`

### Business framing

"For the contractor, this means faster payout confidence. For the company, it means fewer support tickets and fewer reconciliation disputes."

---

## 3.10 Audit Verification

### Speaking script

"For an enterprise buyer, the payout is only half the story. The other half is traceability."

### Frontend action

- open `/compliance`
- show payout ledger
- use filters if useful
- click `Export CSV`

### Talking point

"Here, every payout can be tied back to invoice identity, transaction signature, KYC state, and exportable audit evidence."

---

## 3.11 Explorer Verification

### Speaking script

"This is the proof moment. We are not asking anyone to trust our database. We are showing independent blockchain evidence that the payroll event actually happened."

### Frontend action

- keep one explorer tab open on transaction
- optionally open treasury address tab

### Presenter notes

- this is where to pause for judges
- let them read the explorer page for a few seconds

---

## 4. Blockchain Proof Moments

## 4.1 Solana Explorer Links

### Speaking script

"Every important settlement event ends with a transaction signature and an explorer link. That gives finance teams verifiable proof, not just internal status labels."

### What to show

- treasury wallet explorer link
- payout transaction explorer link
- contractor payout explorer link

### Suggested line

"This is how we bridge enterprise UX and blockchain verifiability: clean dashboard on one side, independent public proof on the other."

## 4.2 Escrow PDA Explanation

### Speaking script

"The escrow PDA is the deterministic program-derived address for that invoice-specific escrow account. It is what lets us make payroll release programmable rather than manual."

## 4.3 Vault Explanation

### Speaking script

"The vault is the token account that actually holds the USDC while the payment is under escrow control. That separation is important for operational safety and auditability."

## 4.4 TX Signature Visibility

### Speaking script

"The transaction signature becomes the canonical settlement reference across the frontend, backend, audit export, and reconciliation systems."

## 4.5 Treasury Reconciliation

### Speaking script

"Because treasury movements are also monitored, we can connect the payout event back to treasury state changes instead of treating on-chain movement and accounting as separate worlds."

---

## 5. Treasury Automation Demo

### Speaking script

"Payroll is not just about releasing funds. Treasury visibility is equally important. We integrated Helius to monitor treasury activity and keep company balances synchronized in near real time."

### Frontend action

- open `/operations`
- point to treasury metrics
- point to reconciliation warnings table

### Explain clearly

- Helius webhook receives treasury transfer events
- treasury transactions are persisted
- company treasury balance is updated
- replay and nonce protections are enforced

### Technical talking point

"If the treasury balance RPC read fails, the system can still fall back to persisted state and reconciliation logic rather than breaking the operator workflow."

### Audience engagement moment

Ask:

"What happens when an enterprise treasury webhook arrives twice?"

Answer:

"We do not double-count it. We track webhook identity and enforce replay protections."

---

## 6. Dodo Integration Demo

### Speaking script

"Payroll infrastructure also needs a business model and billing controls. We integrated Dodo to support hosted checkout, subscription linkage, usage reporting, and signed webhook processing."

### Frontend action

- optionally open `/onboarding`
- point to plan selection cards

### Talking points

- hosted checkout enables subscription onboarding
- usage metering can reflect invoice and payout activity
- signed webhooks update company billing state
- replay handling ensures idempotent processing

### Enterprise-grade line

"This matters because infrastructure companies do not just need money movement. They need monetization infrastructure, webhook integrity, and operational accountability."

### Optional demo line

"In our backend validation, we explicitly tested invalid signatures, successful signed delivery, and replay idempotency."

---

## 7. Advanced Features

## 7.1 Batch Payouts

### Speaking script

"Single payouts are useful, but real payroll happens in batches. The system supports multi-recipient batch payouts executed in a single atomic transaction."

### Frontend action

- on `/dashboard`, point to `Payout Queue`
- point to `Execute Batch Payout`

### Talking point

"That means one treasury action can settle multiple contractor payouts while keeping a shared proof reference and reducing operational overhead."

## 7.2 Split Settlements (95/5)

### Speaking script

"We also support programmable split settlement. For example, 95 percent to the contractor and 5 percent to a fee wallet, all inside one atomic transaction."

### Technical explanation

"That is important for platforms, marketplaces, and embedded payroll use cases where fee routing is part of the business model."

## 7.3 Audit Export

### Speaking script

"On the compliance side, operators can export CSV audit records tied to payouts, treasury events, invoices, webhooks, and reconciliation history."

## 7.4 Payout Traceability

### Speaking script

"The key value is traceability across layers: invoice, payout record, transaction signature, treasury movement, and audit export all stay connected."

---

## 8. Technical Architecture Summary

### Speaking script

"At a high level, the architecture has five layers.

The frontend is built in Next.js with role-based operator and contractor experiences.

The backend uses API routes, Prisma, and Postgres for workflow state, audit records, webhooks, treasury persistence, and recovery data.

The smart contract layer is an Anchor-based Solana escrow program that initializes escrow accounts, receives token deposits, and releases payroll.

The webhook layer handles Dodo for billing events and Helius for treasury monitoring.

And finally, the reconciliation layer ties chain activity back to enterprise operations so failures, duplicates, or mismatches become visible and recoverable."

### Presenter notes

- keep this section high signal
- avoid getting lost in implementation details

---

## 9. Business Value

### Speaking script

"From a business perspective, this creates five immediate advantages.

First, speed: global contractors can be paid in seconds rather than days.

Second, cost reduction: stablecoin settlement reduces dependence on expensive traditional rails.

Third, transparency: every payout has a clear lifecycle and a blockchain proof.

Fourth, programmability: escrow, batch payouts, and split settlements turn payments into infrastructure.

And fifth, compliance visibility: finance teams can export, monitor, and reconcile everything from one operational surface."

---

## 10. Competitive Edge

### Speaking script

"This is not a wallet app.

It is not just a transfer app.

And it is not just a dashboard.

What makes this different is that we are building programmable payroll infrastructure.

The value is in combining operator UX, approval logic, escrow control, treasury monitoring, webhooks, reconciliation, and auditability into one coherent enterprise system.

That is what moves this from crypto tooling to payroll infrastructure."

### Strong line to emphasize

"We are not putting payroll on-chain for novelty. We are making payroll programmable, observable, and globally operable."

---

## 11. Future Roadmap

### Speaking script

"The roadmap from here is straightforward.

We would move from devnet to audited mainnet rollout with stricter treasury controls and production wallet operations.

We would add treasury optimization features such as routing, forecasting, and balance policy automation.

We would expand enterprise APIs for embedded payroll and partner integrations.

We would deepen compliance tooling with richer export formats, alerts, approval policies, and case management.

And over time, we can support multi-chain settlement abstractions while keeping the same enterprise workflow layer."

### Roadmap bullets

- mainnet rollout
- custody and treasury controls
- enterprise APIs
- stronger compliance tooling
- richer automation and recovery
- multi-chain support

---

## 12. Closing Statement

### Speaking script

"Global payroll should not be slow, opaque, and manually reconciled.

It should be programmable, verifiable, and globally accessible.

Borderless Payroll Copilot is our vision for that future: enterprise payroll infrastructure where treasury, approvals, settlement, and auditability work together by design.

As companies become more internet-native and globally distributed, this is not just a better way to move money.

It is the foundation for how global compensation will operate."

---

## Frontend Walkthrough Summary

Use this condensed sequence during the live demo:

1. `/dashboard`
2. show treasury balance and explorer link
3. `/contractor/invoices/new`
4. submit invoice
5. `/dashboard`
6. approve invoice
7. open explorer transaction
8. `/contractor`
9. show paid invoice and proof link
10. `/compliance`
11. export audit CSV
12. `/operations`
13. show treasury/reconciliation/webhook operational visibility

---

## Technical Talking Points Bank

Use these lines selectively during Q&A:

- "We compute a deterministic invoice hash for persistence and traceability."
- "The payout engine blocks duplicate confirmed payouts per invoice."
- "The escrow PDA is deterministic and tied to invoice identity plus treasury authority."
- "The vault ATA is owned by the escrow PDA, not the contractor."
- "The final transaction signature becomes the shared proof reference across the system."
- "Webhook replay and nonce protections prevent duplicate treasury or billing processing."
- "Reconciliation records are created when payout or database confirmation diverges from expected state."
- "This is designed as infrastructure, not as a single transfer workflow."

---

## Audience Engagement Moments

Use these intentionally to keep the room with you:

- "What usually happens today when a cross-border payout is delayed? Finance gets a support thread, not a proof."
- "What if a webhook replays or a payout partially fails? That is where enterprise systems either break or prove their maturity."
- "The question is not whether stablecoins can move. The question is whether enterprises can operate on top of them safely."

---

## Fallback Recovery Plan

## Fallback 1: Explorer is slow

### What to say

"The explorer is loading, but the important point is that the platform already returned the transaction signature, which is the canonical settlement reference."

### What to do

- keep the tx signature visible
- switch to `/compliance` or `/contractor` where the signature or explorer link is already shown

## Fallback 2: Live payout fails

### What to say

"This is exactly why we built operational recovery and reconciliation into the platform. Failures are surfaced, not hidden."

### What to do

- open `/operations`
- show failed payout intervention
- show reconciliation warnings
- explain recovery workflows

## Fallback 3: Wallet or chain environment is unstable

### What to say

"The chain interaction is environment-dependent in a live demo, but the architecture is still verifiable through the generated explorer references and reconciliation data."

### What to do

- use previously validated explorer URLs
- use `/compliance`
- use `/operations`
- refer to validated batch/split artifacts if needed

## Fallback 4: Dodo or Helius live webhook not available

### What to say

"The external provider may not be reachable live, so I’ll show the operational layer and explain how signed delivery and replay handling are validated."

### What to do

- open `/operations`
- open `/enterprise-admin` if useful
- describe webhook processing and replay protection

## Fallback 5: Need a shorter judge-friendly version

### 2-minute compressed flow

1. show `/dashboard`
2. show live treasury
3. show invoice in pending queue
4. approve invoice
5. open explorer
6. show contractor proof
7. show audit export

### What to say

"This is stablecoin payroll infrastructure: treasury visibility, programmable escrow release, on-chain proof, and enterprise-grade traceability."

---

## Final Presenter Notes

- keep pace calm and executive
- never over-explain crypto basics
- always translate technical moments into business value
- pause on proof screens
- if something fails, use it to show operational maturity rather than apologizing
- describe this as infrastructure for global payroll, not as a crypto app

