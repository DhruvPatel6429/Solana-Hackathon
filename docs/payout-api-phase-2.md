# Borderless Payroll Copilot: Payout API Phase 2

Module: Payout API  
Network: Solana Devnet  
Database: PostgreSQL/Supabase via Prisma  
Runtime: Next.js 14 App Router with TypeScript

## 1. Overview

The Payout API executes approved contractor payouts from the backend. It receives a payout request, calls the Solana payout engine to transfer USDC, stores the payout result in the database, and returns the transaction signature.

This module connects off-chain business logic with on-chain settlement. Invoice approval happens in the application database and API layer. Payment execution happens on Solana Devnet. The Payout API is the bridge between those two systems.

In the full product flow, an approved invoice triggers this API. The API records the payout attempt, executes the USDC transfer, confirms the transaction, and stores the signature as proof of payment.

## 2. API Endpoint

### `POST /api/payouts/execute`

Executes a USDC payout for an approved invoice.

Request body:

```json
{
  "invoiceId": "string",
  "wallet": "string",
  "amount": 0.01
}
```

Fields:

- `invoiceId`: Unique invoice identifier for the payout.
- `wallet`: Contractor Solana wallet address.
- `amount`: USDC amount to transfer.

Success response:

```json
{
  "success": true,
  "txHash": "string"
}
```

Failure response:

```json
{
  "success": false,
  "error": "string"
}
```

## 3. Execution Flow

```text
Invoice Approval Trigger
  -> API Call
  -> Payout Service
  -> Solana Transfer
  -> Database Update
```

Step-by-step:

1. An invoice is approved by the application workflow.
2. The backend calls `POST /api/payouts/execute` with the invoice ID, contractor wallet, and amount.
3. The API route parses the JSON body and passes the request to the service layer.
4. The payout service validates the request.
5. The service checks whether a payout already exists for the same `invoiceId`.
6. A database record is created with status `PENDING`.
7. The service calls the Solana transfer module.
8. The Solana module transfers USDC from the treasury wallet to the contractor wallet.
9. After finalized confirmation, the transaction signature is returned.
10. The payout record is updated to `CONFIRMED` with the transaction signature and execution timestamp.
11. The API returns the transaction hash to the caller.

## 4. Database Schema

The payout execution result is stored in the `Payout` model.

```prisma
model Payout {
  id               String    @id @default(cuid())
  invoiceId        String
  contractorWallet String
  amountUsdc       Float
  txSignature      String?
  status           String
  createdAt        DateTime  @default(now())
  executedAt       DateTime?

  @@unique([invoiceId])
  @@index([status])
  @@index([contractorWallet])
}
```

Fields:

- `id`: Internal payout record ID.
- `invoiceId`: Invoice associated with the payout.
- `contractorWallet`: Recipient Solana wallet address.
- `amountUsdc`: Amount paid in USDC.
- `txSignature`: Solana transaction signature after successful payout.
- `status`: Current payout state: `PENDING`, `CONFIRMED`, or `FAILED`.
- `createdAt`: Timestamp when the payout record was created.
- `executedAt`: Timestamp when the on-chain transfer was finalized.

`invoiceId` is unique to prevent duplicate payouts. A single approved invoice should only produce one payout execution record. This protects against repeated API calls, double-clicks, retries, and webhook duplication.

## 5. Service Layer Logic

The service layer is implemented in:

```text
lib/services/payout.service.ts
```

Responsibilities:

- Validate `invoiceId`, wallet address, and amount.
- Reject invalid wallet addresses before creating a transaction.
- Check for an existing payout with the same `invoiceId`.
- Create an initial `PENDING` payout record.
- Execute the blockchain transfer through the Solana module.
- Update the payout to `CONFIRMED` with `txSignature` and `executedAt` on success.
- Update the payout to `FAILED` if transfer execution fails.
- Throw clear errors for the API route to return.

The API route intentionally contains minimal logic. Business rules live in the service layer so they can be reused by invoice approval flows, background jobs, or future batch payout workers.

## 6. Blockchain Integration

The service calls the existing Solana function:

```ts
transferUSDC({
  fromWallet,
  toWallet,
  amount,
});
```

The transfer module:

- Uses the treasury wallet as the signer.
- Transfers SPL-token USDC on Solana Devnet.
- Creates the recipient Associated Token Account if needed.
- Waits for finalized transaction confirmation.
- Returns the transaction signature.

The transaction signature is stored in the database as the proof of payment. Anyone can verify it on Solana Explorer using Devnet mode.

## 7. Error Handling

The API handles the main payout failure modes.

### Invalid Wallet Address

If the recipient wallet is not a valid Solana public key, the request fails before any payout record or transaction is created.

### Insufficient Balance

If the treasury USDC token account does not have enough balance, the payout is marked as `FAILED` and no successful transaction signature is stored.

### Duplicate Invoice

If a payout already exists for the same `invoiceId`, the service rejects the request. This prevents paying the same invoice twice.

### Transaction Failure

If the Solana transaction fails during submission or finalized confirmation, the payout record is marked as `FAILED`, and the API returns an error response.

## 8. Verification Guide

### API Response

Call the endpoint and confirm the response contains:

```json
{
  "success": true,
  "txHash": "..."
}
```

The `txHash` should be a valid Solana transaction signature.

### Solana Explorer

Open:

```text
https://explorer.solana.com/tx/<txHash>?cluster=devnet
```

Verify:

- Transaction status is successful.
- Cluster is Devnet.
- Token transfer instruction is present.
- Treasury token account is the sender.
- Contractor token account is the recipient.

### Supabase Database

Check the `Payout` table.

Expected values:

- `invoiceId` matches the request.
- `contractorWallet` matches the recipient wallet.
- `amountUsdc` matches the requested amount.
- `status` is `CONFIRMED`.
- `txSignature` is populated.
- `executedAt` is populated.

## 9. Example Flow

Example request:

```http
POST /api/payouts/execute
Content-Type: application/json
```

```json
{
  "invoiceId": "inv_test_1",
  "wallet": "recipient_wallet_address",
  "amount": 0.01
}
```

Expected result:

- API returns `success: true`.
- API returns a Solana transaction hash in `txHash`.
- Database creates a `Payout` row for `inv_test_1`.
- Payout status becomes `CONFIRMED`.
- `txSignature` stores the returned transaction hash.
- Solana Explorer shows the USDC transfer on Devnet.

## 10. Known Limitations

- Payout execution is manually triggered through the API.
- There is no production UI connected to this endpoint yet.
- Current transfers use Devnet tokens only.
- Batch payouts are not implemented yet.
- Split settlements are not implemented yet.
- Escrow smart contracts are not connected in this phase.

## 11. Demo Explanation

This module proves that Borderless Payroll Copilot can move beyond invoice tracking and execute real blockchain payments.

Demo pitch:

```text
When an invoice is approved, our backend calls the Payout API.
The API creates a payout record, transfers USDC on Solana Devnet, waits for finalized confirmation, and stores the transaction signature in Supabase.
That signature becomes an auditable proof of payment for the invoice.
```

Why it matters:

- Real on-chain payment: the payout is a Solana transaction, not a mock status update.
- Auditability: every confirmed payout has a transaction signature.
- Automation: invoice approval can trigger payment execution without manual wallet operations.
