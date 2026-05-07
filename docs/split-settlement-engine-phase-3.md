# Borderless Payroll Copilot: Split Settlement Engine Phase 3

Module: Split Settlement Engine  
Network: Solana Devnet  
Token: Devnet USDC SPL token  
Runtime: Node.js with TypeScript

## 1. Overview

Split settlement is an extension of the Solana payout engine that distributes one payout amount across multiple recipients during execution.

In Phase 3, every payout is split into:

- 95% to the contractor
- 5% to the platform fee wallet

This supports the platform revenue model by capturing fees at the same time the contractor is paid. Instead of sending the full amount to the contractor and calculating platform revenue later, the system routes funds during the payout itself.

This improves over the basic payout flow by combining contractor payment and platform fee collection into one verifiable on-chain action.

**Atomic fee capture during payout execution.**

## 2. Architecture

Flow:

```text
Payout Request
  -> Split Calculation
  -> Build Transaction
  -> Contractor Transfer
  -> Fee Transfer
  -> Finalized Confirmation
```

Both transfers occur in one Solana transaction. The contractor transfer and fee transfer are separate SPL-token transfer instructions, but they are submitted together.

This means the settlement is atomic:

- If the transaction succeeds, both transfers succeed.
- If the transaction fails, neither transfer is applied.

There is no state where the contractor is paid but the platform fee is missing, or where the fee is captured but the contractor payment fails.

## 3. Key Features

- Automatic 95/5 payout split
- Atomic transaction execution
- Dual SPL-token transfer instructions in one transaction
- Associated Token Account creation for contractor and fee wallets
- Finalized transaction confirmation
- Logging of split amounts, instruction count, and transaction signature
- Uses the existing treasury wallet as signer
- Uses the existing Devnet USDC token configuration

## 4. Code Structure

The split settlement function is implemented in:

```text
lib/solana/transfer.ts
```

Function:

```ts
transferWithSplit({
  contractorWallet,
  feeWallet,
  amount,
});
```

Responsibilities:

- Validate contractor and fee wallet addresses.
- Validate the payout amount.
- Convert the amount into USDC base units.
- Calculate the 95/5 split.
- Derive treasury, contractor, and fee wallet token accounts.
- Create missing Associated Token Accounts when required.
- Build a single transaction containing both transfer instructions.
- Sign the transaction with the treasury wallet.
- Send the transaction to Solana Devnet.
- Wait for finalized confirmation.
- Return the transaction signature.

## 5. Split Logic

USDC uses 6 decimals. Before splitting, the total human-readable amount is converted into base units.

Example:

```text
1 USDC = 1,000,000 base units
```

Split calculation:

```text
contractorAmount = totalAmount * 95%
feeAmount        = totalAmount * 5%
```

Example:

```text
1 USDC -> 0.95 USDC contractor + 0.05 USDC fee
```

The implementation uses `bigint` for base-unit arithmetic. This avoids floating-point precision issues when calculating token amounts.

The fee amount is calculated from the remainder after the contractor allocation, ensuring the full original amount is distributed.

## 6. Transaction Construction

The function derives Associated Token Accounts for:

- Treasury wallet source account
- Contractor wallet destination account
- Platform fee wallet destination account

Transaction instructions:

1. Create contractor ATA if missing.
2. Create fee wallet ATA if missing.
3. Transfer 95% USDC to contractor.
4. Transfer 5% USDC to fee wallet.

ATA creation instructions are only added when the account does not already exist.

The two transfer instructions are always included in the same transaction. Solana transaction atomicity guarantees both transfers succeed or both fail.

## 7. Execution Flow

1. Validate contractor wallet address.
2. Validate fee wallet address.
3. Validate amount is greater than zero.
4. Convert total amount to USDC base units.
5. Calculate 95% contractor amount and 5% fee amount.
6. Derive treasury, contractor, and fee token accounts.
7. Fetch token account state from Solana.
8. Check treasury USDC balance.
9. Create a new Solana transaction.
10. Add ATA creation instructions if needed.
11. Add contractor transfer instruction.
12. Add fee wallet transfer instruction.
13. Set treasury wallet as fee payer.
14. Sign transaction with treasury wallet.
15. Send the transaction to Solana Devnet.
16. Confirm the transaction with finalized commitment.
17. Return the transaction signature.

## 8. Verification Guide

To verify a split settlement:

1. Open Solana Explorer.
2. Search for the returned transaction signature.
3. Switch Explorer to Devnet.
4. Confirm there is a single transaction.
5. Check the token instructions.
6. Verify there are two USDC transfer instructions.
7. Confirm the contractor received 95% of the total amount.
8. Confirm the fee wallet received 5% of the total amount.
9. Confirm the transaction status is successful and finalized.

Explorer URL format:

```text
https://explorer.solana.com/tx/<signature>?cluster=devnet
```

## 9. Example Output

Example logs:

```text
[solana:split-transfer] Preparing split settlement {
  totalAmount: "1",
  contractorAmount: "0.95",
  contractorAmountBaseUnits: "950000",
  feeAmount: "0.05",
  feeAmountBaseUnits: "50000"
}

[solana:split-transfer] Sending atomic split transaction {
  contractorAmount: "0.95",
  feeAmount: "0.05",
  instructionCount: 2
}

[solana:split-transfer] Transaction submitted {
  signature: "5j7ExampleSplitSettlementSignature"
}

[solana:split-transfer] Transaction finalized {
  signature: "5j7ExampleSplitSettlementSignature"
}
```

If either destination wallet is missing its Associated Token Account, the instruction count may be higher because ATA creation instructions are added before the transfers.

## 10. Edge Cases Handled

### Invalid Wallet Address

The contractor and fee wallet inputs are parsed as Solana public keys. Invalid addresses are rejected before transaction construction.

### Insufficient Balance

The treasury USDC balance is checked before sending. If the treasury does not have enough USDC for the full amount, the transaction is not submitted.

### Zero or Too-Small Amounts

The total amount must be greater than zero. The split must also produce positive base-unit amounts for both contractor and fee allocations.

This prevents transactions where the fee or contractor share would round down to zero.

### Missing ATA

If the contractor or fee wallet does not have an Associated Token Account for the USDC mint, the function creates it in the same transaction before transferring funds.

## 11. Known Limitations

- The split ratio is fixed at 95/5.
- The implementation is Devnet only.
- Fee percentage is not dynamically configurable.
- Fee wallet routing is not tenant-specific yet.
- Batch payout integration is not implemented yet.
- Payout API integration for split settlement is not connected yet.

## 12. Future Improvements

- Configurable fee percentage per company or plan.
- Dynamic fee routing to tenant-specific or product-specific wallets.
- Integration with the payout execution API.
- Multi-recipient split support.
- Batch split settlements for paying many contractors at once.
- Database storage of contractor amount and fee amount.
- Admin dashboard visibility for platform fee revenue.

## 13. Demo Explanation

This feature demonstrates that Borderless Payroll Copilot can automate both payroll and revenue capture in the same blockchain transaction.

Demo pitch:

```text
In Phase 3, a payout is no longer just a transfer to a contractor.
The system automatically splits the payout: 95% goes to the contractor, and 5% goes to the platform fee wallet.
Both transfers are included in one Solana transaction, so the accounting is atomic and verifiable on-chain.
```

Why it matters:

- Real revenue capture: the platform fee is collected during settlement.
- Atomic on-chain accounting: contractor payment and platform fee capture succeed together.
- No reconciliation required: the transaction itself shows exactly how funds moved.

**We don't just move money - we program how money moves.**
