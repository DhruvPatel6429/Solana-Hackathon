# Batch Payout Engine: Phase 4

Project: Borderless Payroll Copilot  
Module: Batch Payout Engine  
Network: Solana Devnet  
Token: USDC SPL token

## 1. Overview

Batch payout allows the system to pay multiple contractors in one Solana transaction.

Instead of sending a separate transaction for every contractor, the engine builds one transaction containing multiple SPL-token transfer instructions. This is useful for payroll because finance teams often need to pay many contractors at the same time.

Batch payout improves:

- Efficiency: fewer transactions to submit and confirm.
- Cost control: one transaction fee payer flow instead of repeated manual sends.
- Auditability: one transaction can represent a full payout run.
- Reliability: all included payments succeed together or fail together.

## 2. Architecture

Flow:

```text
Treasury USDC ATA
  -> Recipient 1 USDC ATA
  -> Recipient 2 USDC ATA
  -> Recipient 3 USDC ATA
  -> ...
```

The treasury wallet signs one transaction. That transaction contains instructions for every recipient payout.

The transaction is atomic:

- If the transaction succeeds, every recipient receives their USDC.
- If the transaction fails, no recipient transfer is applied.

## 3. Key Features

- Atomic batch execution
- Multiple USDC transfers in one transaction
- Automatic Associated Token Account creation for recipients
- Treasury balance validation before sending
- Finalized transaction confirmation
- Transaction signature logging
- Maximum recipient guard to avoid transaction size issues

## 4. Function

Implemented function:

```ts
executeBatchPayout(
  recipients: { wallet: string; amount: number }[],
): Promise<{ signature: string }>
```

Each recipient includes:

- `wallet`: Solana recipient wallet address.
- `amount`: USDC amount to transfer.

Example:

```ts
await executeBatchPayout([
  { wallet: "recipient_wallet_1", amount: 0.01 },
  { wallet: "recipient_wallet_2", amount: 0.02 },
]);
```

## 5. Execution Flow

1. Validate recipients array is not empty.
2. Validate recipient count is not greater than 10.
3. Validate each wallet is a valid Solana public key.
4. Validate each amount is greater than zero.
5. Convert each amount into USDC base units.
6. Compute the total required USDC amount.
7. Derive the treasury USDC token account.
8. Derive each recipient USDC token account.
9. Check the treasury token balance.
10. Build one Solana transaction.
11. Add ATA creation instructions for missing recipient token accounts.
12. Add one transfer instruction per recipient.
13. Sign the transaction with the treasury wallet.
14. Send the transaction to Solana Devnet.
15. Confirm the transaction with finalized commitment.
16. Return the transaction signature.

## 6. Transaction Details

The batch transaction can include two types of instructions.

### ATA Creation

If a recipient does not have an Associated Token Account for the USDC mint, the engine adds:

```text
createAssociatedTokenAccountInstruction
```

This allows first-time recipients to be paid without manual setup.

### USDC Transfer

For each recipient, the engine adds:

```text
createTransferInstruction
```

Each transfer moves USDC from the treasury token account to the recipient token account.

All instructions are included in the same transaction.

## 7. Limits

The current implementation supports a maximum of 10 recipients per batch.

This limit exists because Solana transactions have size and compute constraints. Every recipient may require:

- One ATA creation instruction
- One transfer instruction

Keeping the limit at 10 reduces the risk of oversized transactions while still demonstrating practical batch payroll execution.

## 8. Verification

To verify a batch payout:

1. Copy the returned transaction signature.
2. Open Solana Explorer.
3. Switch to Devnet.
4. Search for the transaction signature.
5. Confirm the transaction succeeded.
6. Check that multiple token transfer instructions appear in the same transaction.
7. Confirm each recipient received the expected USDC amount.

Explorer URL:

```text
https://explorer.solana.com/tx/<signature>?cluster=devnet
```

## 9. Edge Cases

### Empty List

The function rejects an empty recipients array.

### Invalid Wallet

Each wallet is parsed as a Solana public key. Invalid addresses are rejected before transaction construction.

### Insufficient Balance

The treasury balance must be greater than or equal to the total batch amount. If not, the transaction is not submitted.

### Too Many Recipients

Requests with more than 10 recipients are rejected to avoid transaction size failures.

### Missing ATA

Missing recipient Associated Token Accounts are created inside the batch transaction before transfer instructions execute.

## 10. Demo Explanation

Batch payout shows that the system can execute real payroll operations, not just individual test transfers.

Demo pitch:

```text
With the Batch Payout Engine, one approved payroll run can pay multiple contractors in a single Solana transaction.
The engine validates the recipients, checks treasury balance, creates token accounts if needed, sends all transfers together, and waits for finalized confirmation.
```

Key line:

**One click -> multiple payments executed atomically on-chain.**
