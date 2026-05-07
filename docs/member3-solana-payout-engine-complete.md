# Member 3: Solana Payout Engine & Smart Contract Architecture

Project: Borderless Payroll Copilot  
Owner: Member 3 — Solana Payout Engine & Smart Contract Lead  
Network: Solana Devnet  
Status: Production-minded hackathon MVP

## 1. Project Overview

Borderless Payroll Copilot is a Solana-powered programmable payroll platform for global contractor payments. The Member 3 module provides the on-chain settlement layer: USDC transfers, payout APIs, split settlement, batch payouts, escrow smart contracts, and audit-grade transaction tracking.

The system enables:

- Escrow-backed contractor payments
- Stablecoin payroll using SPL-token USDC
- Atomic payout settlement
- On-chain auditability
- Automated payout execution after invoice approval

Stablecoins and Solana improve payroll by making settlement faster, cheaper, more transparent, and programmable. Instead of waiting on bank wires and fragmented reconciliation, finance teams can fund a treasury, lock funds per invoice, approve payouts, and store verifiable transaction signatures.

The complete backend system connects invoice approval logic to Solana escrow vaults, releases funds through an Anchor smart contract, confirms transactions with finalized commitment, and records payout state in PostgreSQL through Prisma.

## 2. System Architecture

High-level flow:

```text
Frontend / Dashboard
  -> Invoice Workflow
  -> Payout API
  -> Anchor Escrow Program
  -> Solana Blockchain
  -> Database Audit Trail
```

Full payout lifecycle:

```text
Invoice Created
  -> Escrow Initialized
  -> USDC Deposited
  -> Approval Triggered
  -> Smart Contract Release
  -> Contractor Paid
  -> Transaction Logged
```

Component responsibilities:

- Frontend/dashboard: initiates invoice and payout workflows.
- Invoice workflow: determines when an invoice is approved.
- Payout API: validates payout requests and coordinates execution.
- Anchor escrow program: enforces custody and release rules on-chain.
- Solana blockchain: settles USDC transfers and provides transaction proof.
- Database: stores payout records, statuses, escrow PDA, and transaction signatures.
- Treasury wallet: signs deposits, escrow releases, direct transfers, split settlements, and batch payouts.

The backend orchestrates the flow, but settlement rules are enforced by Solana programs and SPL token ownership.

## 3. Technology Stack

- Solana Devnet: public test network for transaction execution and demo verification.
- Anchor Framework: Rust framework used to build the escrow smart contract.
- SPL Token Program: handles USDC token accounts and token transfers.
- Node.js: backend runtime for payout services and scripts.
- TypeScript: type-safe implementation for Solana services and APIs.
- Prisma ORM: typed database access for payout records.
- PostgreSQL / Supabase: persistent storage for payout audit state.
- `@solana/web3.js`: Solana connection, public keys, transactions, and confirmations.
- `@solana/spl-token`: Associated Token Account derivation and SPL transfer instructions.
- `@project-serum/anchor`: backend Anchor client used to call the deployed escrow program.

## 4. Solana Transfer Engine

The direct transfer function is:

```ts
transferUSDC({
  fromWallet,
  toWallet,
  amount,
});
```

It sends USDC from the treasury wallet to a recipient wallet on Solana Devnet.

Core behavior:

- Parses and validates recipient wallet addresses.
- Converts human-readable USDC into 6-decimal base units.
- Derives the treasury USDC Associated Token Account.
- Derives the recipient USDC Associated Token Account.
- Creates the recipient ATA if missing.
- Checks treasury USDC balance before transfer.
- Builds an SPL-token transfer transaction.
- Signs with the treasury wallet.
- Sends the transaction and waits for finalized confirmation.
- Returns the transaction signature.

Explorer verification:

```text
https://explorer.solana.com/tx/<signature>?cluster=devnet
```

This direct transfer engine was the initial payout primitive. It remains useful for test transfers and simple treasury operations, while production payout execution now routes through escrow-controlled releases.

## 5. Split Settlement Engine

The split settlement function is:

```ts
transferWithSplit({
  contractorWallet,
  feeWallet,
  amount,
});
```

It routes a single payout into two destinations:

- 95% to the contractor
- 5% to the platform fee wallet

The split is executed in one atomic Solana transaction. Both transfers succeed or both fail.

Split math:

```text
totalAmount -> USDC base units
contractorAmount = total * 95%
feeAmount = total - contractorAmount
```

The implementation uses `bigint` for base-unit arithmetic to avoid floating-point precision issues.

Verification flow:

1. Open the returned transaction signature in Solana Explorer.
2. Confirm the transaction is on Devnet.
3. Verify two SPL-token transfer instructions.
4. Confirm the contractor received 95%.
5. Confirm the fee wallet received 5%.

## 6. Batch Payout Engine

The batch payout function is:

```ts
executeBatchPayout(
  recipients: { wallet: string; amount: number }[],
);
```

It pays multiple recipients in one atomic transaction.

Core behavior:

- Validates recipient list is not empty.
- Limits batch size to 10 recipients.
- Validates each wallet and amount.
- Converts all amounts into USDC base units.
- Computes the total required treasury balance.
- Creates missing recipient ATAs.
- Adds one SPL transfer instruction per recipient.
- Signs once with the treasury wallet.
- Confirms the transaction with finalized commitment.

Batching improves payroll efficiency because one approved payroll run can settle many contractor payments in a single on-chain transaction. It reduces operational overhead and produces a compact transaction proof for multiple payments.

The 10-recipient cap protects against Solana transaction size and compute constraints, especially when first-time recipients need ATA creation.

## 7. Escrow Smart Contract

The escrow smart contract is an Anchor program that locks USDC per invoice and releases funds only after approval.

### Escrow Architecture

Each invoice has its own escrow PDA and vault.

PDA seeds:

```text
["escrow", authority, invoice_id]
```

This gives deterministic escrow derivation:

```text
company/admin authority + invoice_id -> escrow PDA
```

The same company can create multiple independent escrows because each invoice ID generates a separate PDA.

### EscrowAccount Structure

```rust
pub struct EscrowAccount {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub is_released: bool,
    pub bump: u8,
    pub invoice_id: [u8; 32],
}
```

Fields:

- `authority`: Company/admin wallet allowed to deposit and release.
- `mint`: USDC mint used by the escrow.
- `vault`: Token account owned by the escrow PDA.
- `amount`: Escrowed token amount in base units.
- `is_released`: Prevents double release.
- `bump`: PDA bump for signer seeds.
- `invoice_id`: 32-byte invoice identifier.

### Smart Contract Instructions

#### `initialize_escrow`

Creates the escrow PDA and vault ATA.

Actions:

- Creates `EscrowAccount`.
- Creates vault ATA owned by the escrow PDA.
- Stores authority, mint, vault, bump, and invoice ID.
- Initializes amount to `0`.
- Initializes release flag to `false`.
- Emits `EscrowInitialized`.

#### `deposit`

Deposits USDC into the escrow vault.

Actions:

- Requires signer to match escrow authority.
- Requires amount greater than zero.
- Requires escrow not released.
- Transfers USDC from authority ATA to vault ATA.
- Updates escrow amount using checked arithmetic.
- Emits `EscrowDeposited`.

#### `release`

Releases escrowed funds to the contractor.

Actions:

- Requires signer to match escrow authority.
- Requires escrow not already released.
- Requires escrow amount greater than zero.
- Creates contractor ATA if missing.
- Transfers all escrowed USDC to contractor ATA.
- Uses PDA signer seeds because the escrow PDA owns the vault.
- Marks escrow released.
- Sets escrow amount to `0`.
- Emits `EscrowReleased`.

Token movement is performed through CPI calls to the SPL Token Program.

## 8. Escrow API Integration

The backend escrow integration lives in:

```text
lib/solana/escrow.ts
```

Responsibilities:

- Configure the Anchor client for the deployed escrow program.
- Convert invoice IDs into 32-byte PDA seeds.
- Derive escrow PDAs using the same seeds as the program.
- Derive vault and contractor token accounts.
- Validate contractor wallet addresses.
- Fetch escrow account state.
- Detect missing or already released escrows.
- Call Anchor `release()`.
- Confirm transactions with finalized commitment.
- Return transaction signature and escrow PDA.

The payout execution path changed from:

```text
direct treasury transfer -> contractor
```

to:

```text
escrow PDA vault -> smart contract release -> contractor
```

This moves payout enforcement from backend convention into on-chain program logic.

## 9. Payout Execution API

Endpoint:

```text
POST /api/payouts/execute
```

Request:

```json
{
  "invoiceId": "string",
  "wallet": "string",
  "amount": 0.01
}
```

Execution flow:

1. Validate request body.
2. Validate invoice ID, contractor wallet, and amount.
3. Prevent duplicate payout by checking `invoiceId`.
4. Derive escrow PDA.
5. Create database payout record with status `PENDING`.
6. Execute Anchor escrow `release`.
7. Confirm finalized Solana transaction.
8. Store transaction signature.
9. Store escrow PDA.
10. Update payout status to `CONFIRMED`.
11. Set `executedAt`.

Success response:

```json
{
  "success": true,
  "txHash": "solana_transaction_signature"
}
```

Failure response:

```json
{
  "success": false,
  "error": "message"
}
```

## 10. Database Design

The primary payout record is `Payout`.

Fields:

- `invoiceId`: Unique invoice identifier.
- `contractorWallet`: Recipient contractor wallet.
- `amountUsdc`: Requested payout amount.
- `txSignature`: Finalized Solana transaction signature.
- `status`: Payout state.
- `executedAt`: Finalized execution timestamp.
- `escrowPda`: On-chain escrow account used for payout release.

Lifecycle:

```text
PENDING -> CONFIRMED
PENDING -> FAILED
```

`invoiceId` is unique to prevent paying the same invoice twice. `escrowPda` links the database record to the on-chain escrow account.

## 11. On-Chain Audit Trail

Every successful payout stores a Solana transaction signature.

This enables:

- Independent verification on Solana Explorer
- Proof that funds moved on-chain
- Traceability from invoice to payout record to transaction
- Audit-grade evidence for finance teams

Explorer URL:

```text
https://explorer.solana.com/tx/<txSignature>?cluster=devnet
```

Admins can verify:

- The transaction succeeded.
- The escrow program was invoked.
- USDC moved from escrow vault to contractor ATA.
- The contractor wallet received funds.
- The payout record matches the transaction signature.

## 12. Security Design

Implemented protections:

- Authority-only escrow release: only the stored admin authority can release funds.
- Authority-only deposits: only the escrow authority can fund its escrow.
- PDA ownership enforcement: escrow vault is owned by the escrow PDA.
- Double-release prevention: `is_released` blocks repeated release.
- Mint validation: backend verifies escrow mint matches configured USDC mint.
- Finalized confirmations: payouts are only marked successful after finalized confirmation.
- Checked arithmetic: deposits use safe `checked_add`.
- Duplicate payout prevention: `invoiceId` is unique in the database.

These protections prevent accidental duplicate payments, unauthorized release, incorrect mint use, and false-positive payout records.

## 13. Error Handling

Smart contract errors:

- `Unauthorized`: signer is not allowed to release funds.
- `AlreadyReleased`: escrow has already been released.
- `InvalidAmount`: amount is zero or invalid.
- `InvalidAuthority`: signer does not match escrow authority.

Backend errors:

- `EscrowNotFoundError`: no escrow account exists for the derived PDA.
- `EscrowAlreadyReleasedError`: escrow was already released.
- `InvalidWalletAddressError`: contractor wallet is invalid.
- `DuplicatePayoutError`: payout already exists for the invoice.
- `PayoutExecutionError`: payout failed during transaction execution or database update.

API status codes:

- `400`: invalid request or invalid wallet.
- `404`: escrow not found.
- `409`: duplicate payout or escrow already released.
- `502`: Solana, Anchor, or payout execution failure.

## 14. Verification & Testing

End-to-end escrow payout verification:

1. Initialize escrow for an invoice.
2. Deposit USDC into the escrow vault.
3. Call `POST /api/payouts/execute`.
4. Verify contractor USDC balance increased.
5. Verify escrow vault balance decreased to zero.
6. Verify escrow account `is_released = true`.
7. Open the transaction in Solana Explorer.
8. Verify the escrow program instruction.
9. Verify the SPL-token transfer.
10. Verify database `Payout` record:
    - `status = CONFIRMED`
    - `txSignature` populated
    - `escrowPda` populated
    - `executedAt` populated

Split settlement verification:

1. Execute `transferWithSplit`.
2. Open the returned signature in Explorer.
3. Verify two token transfers in the same transaction.
4. Confirm 95% went to contractor and 5% went to fee wallet.

Batch payout verification:

1. Execute `executeBatchPayout`.
2. Open the returned signature in Explorer.
3. Verify one transaction contains multiple transfer instructions.
4. Confirm every recipient received the expected USDC amount.

Expected result: all settlement paths produce finalized Solana transaction signatures and can be independently verified.

## 15. Example End-to-End Flow

Example:

```text
invoiceId: inv_demo_001
amount: 1 USDC
```

Flow:

1. Invoice `inv_demo_001` is created.
2. Escrow PDA is initialized using authority and invoice ID.
3. Company deposits `1 USDC` into the escrow vault.
4. Admin approves the invoice.
5. Backend calls `POST /api/payouts/execute`.
6. Backend derives the escrow PDA.
7. Anchor program releases escrowed funds.
8. Contractor receives `1 USDC`.
9. Transaction signature is returned.
10. Database payout record is marked `CONFIRMED`.

Resulting state:

- Escrow amount is `0`.
- Escrow is marked released.
- Contractor owns the released USDC.
- Database stores the transaction proof.
- Explorer verifies the settlement.

## 16. Treasury Management (MVP Roadmap)

The MVP includes treasury management as a roadmap feature.

Intended future behavior:

- Monitor idle treasury USDC.
- Keep a liquidity threshold available for payroll.
- Allocate excess idle funds to yield opportunities.
- Track allocation transactions for auditability.
- Integrate with Kamino or other Solana yield venues.

Yield allocation remains intentionally simulated in MVP to prioritize payout reliability and demo stability.

The production path is clear, but the hackathon implementation focuses on core payroll settlement, escrow enforcement, and auditability first.

## 17. Known Limitations

- Devnet only.
- Single authority model.
- No multisig approvals.
- No timelocks.
- Manual escrow initialization.
- Manual escrow funding.
- No real DeFi integration in MVP.
- No partial escrow release.
- No automated Helius webhook reconciliation yet.

## 18. Future Improvements

- Mainnet deployment.
- Automated escrow creation when invoices are approved.
- Treasury top-up UI.
- Helius webhooks for escrow and payout events.
- Multisig approvals for high-value payments.
- Automated compliance checks.
- Configurable fee routing.
- Batch escrow release.
- Real treasury yield integrations.
- Contractor-facing payout history powered by on-chain signatures.

## 19. Demo Walkthrough

Ideal judge demo flow:

1. Create invoice  
   Show a contractor invoice entering the workflow.

2. Initialize escrow  
   Show that the invoice has a deterministic escrow PDA.

3. Deposit USDC  
   Show the treasury funding the invoice-specific escrow vault.

4. Approve invoice  
   Explain that approval triggers the payout execution API.

5. Trigger payout  
   Call `POST /api/payouts/execute` and show the returned transaction hash.

6. Show Explorer transaction  
   Demonstrate that the escrow program released USDC to the contractor wallet.

7. Show DB audit trail  
   Show `Payout` status, transaction signature, escrow PDA, and execution timestamp.

What judges should notice:

- Funds are locked before approval.
- Approval releases funds through the smart contract.
- Settlement is real on-chain USDC movement.
- The transaction signature is stored for auditability.
- The backend and smart contract are integrated end to end.

## 20. Final Technical Summary

The Member 3 Solana module demonstrates programmable payroll infrastructure on Solana.

It includes:

- Stablecoin-native contractor payments
- Escrow-enforced settlement
- Direct USDC transfers
- Split settlement
- Batch payout execution
- Anchor smart contract custody
- Backend payout APIs
- Prisma-backed payout state
- On-chain transaction auditability

This system proves that payroll can move beyond manual banking workflows and become software-defined financial infrastructure. Approval logic, custody, release, settlement, and audit trails can all be connected through Solana transactions.

**Borderless Payroll Copilot transforms payroll from a manual financial workflow into programmable on-chain infrastructure.**
