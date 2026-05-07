# Escrow Smart Contract + Payout API Integration

Project: Borderless Payroll Copilot  
Module: Escrow Smart Contract + Payout API Integration  
Network: Solana Devnet  
Backend: Node.js, TypeScript, Prisma, PostgreSQL/Supabase  
Blockchain: Anchor, SPL Token Program, `@project-serum/anchor`, `@solana/web3.js`

## 1. Overview

The escrow integration connects the payout backend to an Anchor-based Solana smart contract. Instead of sending USDC directly from the treasury wallet to a contractor, the system locks USDC in a smart-contract-controlled escrow vault tied to a specific invoice.

Escrow-based settlement matters because invoice approval and fund release become enforceable on-chain. Funds are not moved by backend convention alone. They are released only when the escrow program validates the authority, escrow state, and release conditions.

Direct payouts send funds immediately from treasury to contractor. Escrow-controlled payouts first lock funds per invoice, then release them only after approval.

**Funds are released only through smart-contract-enforced approval.**

## 2. System Architecture

Full flow:

```text
Company Treasury
  -> Escrow PDA Vault
  -> Invoice Approval
  -> Smart Contract Release
  -> Contractor Wallet
  -> Database Audit Trail
```

System components:

- Backend API receives payout execution requests.
- Backend derives the escrow PDA for the invoice.
- Anchor client calls the deployed escrow program.
- Solana executes the escrow release transaction.
- SPL Token Program transfers USDC from the escrow vault to the contractor.
- Prisma stores payout status, escrow PDA, transaction signature, and execution timestamp.

The backend coordinates the workflow, but the smart contract enforces fund custody and release rules.

## 3. Smart Contract Design

The Anchor program lives in:

```text
programs/escrow/src/lib.rs
```

### PDA Structure

Escrow PDA seeds:

```text
["escrow", authority, invoice_id]
```

Where:

- `authority` is the company/admin wallet.
- `invoice_id` is a 32-byte invoice identifier.

This creates a deterministic escrow address for each invoice. The same authority can have multiple escrows because each invoice ID produces a different PDA.

Result:

```text
one invoice -> one escrow PDA -> one escrow vault
```

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

- `authority`: Company/admin wallet authorized to deposit and release funds.
- `mint`: SPL token mint used by the escrow, expected to be Devnet USDC.
- `vault`: Token account owned by the escrow PDA.
- `amount`: Amount currently held in escrow, stored in token base units.
- `is_released`: Prevents double release.
- `bump`: PDA bump used for signer seeds.
- `invoice_id`: 32-byte invoice identifier used in PDA derivation.

## 4. Smart Contract Instructions

### `initialize_escrow`

Creates a new escrow for one invoice.

Actions:

- Derives the escrow PDA using `["escrow", authority, invoice_id]`.
- Creates the `EscrowAccount`.
- Creates the vault ATA owned by the escrow PDA.
- Stores authority, mint, vault, bump, and invoice ID.
- Initializes `amount = 0`.
- Initializes `is_released = false`.
- Emits `EscrowInitialized`.

### `deposit`

Deposits USDC into the escrow vault.

Actions:

- Requires signer to match `escrow.authority`.
- Requires amount greater than zero.
- Requires escrow has not already been released.
- Transfers USDC from authority token account to escrow vault.
- Updates `escrow.amount` using checked arithmetic.
- Emits `EscrowDeposited`.

The transfer uses CPI into the SPL Token Program via `token::transfer`.

### `release`

Releases escrowed USDC to the contractor after invoice approval.

Actions:

- Requires signer to match `escrow.authority`.
- Requires escrow has not already been released.
- Requires escrow amount greater than zero.
- Creates contractor ATA if missing.
- Transfers the full escrow amount from vault to contractor ATA.
- Uses escrow PDA signer seeds.
- Sets `is_released = true`.
- Sets `amount = 0`.
- Emits `EscrowReleased`.

The escrow PDA signs the token transfer because it owns the vault token account.

## 5. Escrow Service Layer

Backend escrow integration lives in:

```text
lib/solana/escrow.ts
```

Responsibilities:

- Configure Anchor client for the deployed escrow program.
- Derive escrow PDAs using the same seeds as the smart contract.
- Convert invoice IDs into 32-byte PDA seed values.
- Derive escrow vault token accounts.
- Derive contractor Associated Token Accounts.
- Validate contractor wallet addresses.
- Fetch escrow account state.
- Detect missing or already released escrows.
- Call Anchor `release()`.
- Confirm transactions with finalized commitment.
- Return transaction signatures and escrow PDA addresses.

## 6. Invoice ID Handling

The escrow PDA requires a 32-byte `invoice_id` seed.

Backend handling:

- If `invoiceId` is 64 hex characters, it is decoded into exactly 32 bytes.
- Otherwise, `invoiceId` is UTF-8 encoded and padded to 32 bytes.
- UTF-8 invoice IDs longer than 32 bytes are rejected.

This mapping must be consistent across escrow initialization, escrow lookup, and payout release. If escrow creation and release use different invoice ID encoding, the backend will derive a different PDA and fail to find the escrow.

Example:

```text
invoiceId: inv_test_1
-> UTF-8 bytes
-> padded to 32 bytes
-> PDA seed
```

## 7. API Integration

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
3. Check that no payout already exists for the same `invoiceId`.
4. Derive escrow PDA from authority and invoice ID.
5. Create payout record with status `PENDING`.
6. Call `releaseEscrow({ invoiceId, contractorWallet })`.
7. Anchor program releases escrow funds to contractor.
8. Backend receives finalized transaction signature.
9. Update payout status to `CONFIRMED`.
10. Store `txSignature`, `escrowPda`, and `executedAt`.
11. Return transaction hash to caller.

Response:

```json
{
  "success": true,
  "txHash": "solana_transaction_signature"
}
```

## 8. Database Integration

The `Payout` model tracks payout execution state.

Lifecycle:

```text
PENDING -> CONFIRMED
PENDING -> FAILED
```

Important fields:

- `invoiceId`: Unique invoice identifier. Prevents duplicate payout attempts.
- `contractorWallet`: Contractor wallet receiving escrow release.
- `amountUsdc`: Requested payout amount for business records.
- `escrowPda`: On-chain escrow PDA linked to the payout.
- `txSignature`: Finalized Solana transaction signature.
- `status`: `PENDING`, `CONFIRMED`, or `FAILED`.
- `executedAt`: Timestamp when the payout was finalized.

If escrow release fails, the payout record is marked `FAILED`. The same invoice cannot be processed again because `invoiceId` is unique.

## 9. Escrow Status Endpoint

Endpoint:

```text
GET /api/escrow/:invoiceId
```

Purpose:

- Derive the escrow PDA for an invoice.
- Fetch escrow state from Solana.
- Return escrow status to the backend or dashboard.

Returned fields:

- `exists`: Whether the escrow account exists on-chain.
- `escrowPda`: Derived escrow PDA address.
- `vault`: Escrow vault token account.
- `amount`: Escrow amount in token base units.
- `isReleased`: Whether escrow has already been released.

Example response:

```json
{
  "success": true,
  "escrow": {
    "exists": true,
    "escrowPda": "EscrowPdaAddress",
    "vault": "VaultTokenAccount",
    "amount": "1000000",
    "isReleased": false
  }
}
```

## 10. Security Design

Protections:

- Authority-only deposit: only the escrow authority can deposit into that escrow.
- Authority-only release: only the escrow authority can approve release.
- Deterministic PDA ownership: escrow vault is owned by the escrow PDA.
- Double-release prevention: `is_released` blocks repeated releases.
- Finalized confirmation: backend stores success only after finalized confirmation.
- Mint validation: backend verifies escrow mint matches configured Devnet USDC.
- Checked arithmetic: deposits update escrow amount with `checked_add`.
- No floating point on-chain: token amounts are stored as `u64` base units.

## 11. Error Handling

Handled backend errors:

- `EscrowNotFoundError`: No escrow account exists for the invoice PDA.
- `EscrowAlreadyReleasedError`: Escrow was already released.
- `InvalidWalletAddressError`: Contractor wallet is not a valid Solana public key.
- `DuplicatePayoutError`: A payout already exists for the invoice.
- `PayoutExecutionError`: Escrow release finalized or DB update failed unexpectedly.

API status codes:

- `400`: Invalid request or invalid wallet input.
- `404`: Escrow not found.
- `409`: Duplicate payout or escrow already released.
- `502`: Solana or Anchor transaction execution failure.

## 12. Verification Guide

1. Initialize escrow for an invoice using the Anchor program.
2. Deposit USDC from the company treasury into the escrow vault.
3. Call `POST /api/payouts/execute`.
4. Copy the returned transaction signature.
5. Open Solana Explorer in Devnet mode.
6. Verify the transaction calls the escrow program.
7. Verify SPL token transfer from escrow vault to contractor ATA.
8. Verify contractor USDC balance increased.
9. Query `GET /api/escrow/:invoiceId`.
10. Verify escrow `amount` is `0` and `isReleased` is `true`.
11. Check Supabase `Payout` row.
12. Verify `status = CONFIRMED`, `txSignature` is populated, `escrowPda` is populated, and `executedAt` is set.

Explorer URL:

```text
https://explorer.solana.com/tx/<txSignature>?cluster=devnet
```

## 13. Example End-to-End Flow

Example invoice:

```text
invoiceId: inv_test_1
```

Flow:

1. Backend or admin script initializes escrow for `inv_test_1`.
2. Company treasury deposits `1 USDC` into the escrow vault.
3. Admin approves the invoice.
4. Backend calls:

```http
POST /api/payouts/execute
Content-Type: application/json
```

```json
{
  "invoiceId": "inv_test_1",
  "wallet": "contractor_wallet_address",
  "amount": 1
}
```

Expected result:

- Escrow program releases funds.
- Contractor receives `1 USDC`.
- Escrow vault amount becomes `0`.
- Escrow account is marked released.
- API returns transaction signature.
- Database stores `txSignature`, `escrowPda`, `CONFIRMED`, and `executedAt`.

## 14. Known Limitations

- Devnet only.
- Single authority model.
- No multisig approval.
- No timelocks.
- Manual escrow initialization.
- Manual escrow funding.
- One release per escrow.
- No partial release support.

## 15. Future Improvements

- Automated invoice-triggered escrow creation.
- Automated treasury deposit into escrow on invoice approval.
- Multisig approvals for high-value invoices.
- Configurable release conditions.
- Timelocked or milestone-based releases.
- Batch escrow release.
- Mainnet deployment.
- Dashboard controls for escrow lifecycle management.

## 16. Demo Explanation

This integration demonstrates programmable payroll. The company does not simply mark invoices as paid in a database. It locks USDC into an on-chain escrow and releases it only through smart-contract rules.

Demo pitch:

```text
Each invoice gets its own Solana escrow vault.
When the company funds the escrow, USDC is locked under PDA control.
When the invoice is approved, our backend calls the Anchor program to release the funds.
The transaction signature is stored in Supabase as proof of payment.
```

Why it matters:

- Programmable payroll: payout rules are encoded in a smart contract.
- On-chain escrow enforcement: backend code cannot bypass release rules.
- Auditability: every release produces a Solana transaction signature.
- Automated settlement: approval can trigger finalized USDC movement.

**We don't just automate payroll - we enforce payroll logic directly on-chain.**
