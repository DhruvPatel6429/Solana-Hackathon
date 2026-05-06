# Borderless Payroll Copilot: Solana Payout Engine

Module owner: Member 3  
Network: Solana Devnet  
Token: Devnet USDC custom faucet mint  
Runtime: Node.js with TypeScript

## 1. Overview

The Solana Payout Engine is the on-chain payment module for Borderless Payroll Copilot. It transfers USDC from the platform treasury wallet to contractor wallets after invoices are approved by the business admin.

This module exists to make contractor payroll fast, verifiable, and globally accessible. Instead of relying on slow international wires, the platform settles approved payouts on Solana Devnet using SPL-token USDC.

In the overall architecture, the payout engine sits behind the invoice approval workflow. Once an invoice is approved, the backend calls the payout service, which builds, signs, sends, and confirms a Solana transaction. The finalized transaction signature becomes the on-chain proof of payment stored against the payout record.

## 2. Architecture

The payout flow follows this sequence:

```text
Invoice Approved
  -> API Trigger
  -> Payout Service
  -> Solana Transfer
  -> Transaction Confirmation
  -> Store TX Signature
```

Step-by-step flow:

1. The contractor submits an invoice.
2. The finance admin reviews and approves the invoice.
3. The approval endpoint triggers the payout service.
4. The payout service calls the Solana transfer function with the treasury wallet, recipient wallet, and USDC amount.
5. The Solana transfer module validates the recipient address and treasury token balance.
6. The module ensures the recipient has an Associated Token Account for the configured USDC mint.
7. A token transfer transaction is built using `@solana/spl-token`.
8. The transaction is signed by the treasury wallet.
9. The transaction is submitted to Solana Devnet.
10. The system waits for finalized confirmation.
11. The finalized transaction signature is returned and stored as proof of payment.

The transaction signature is the key audit artifact. It can be opened in Solana Explorer to prove that the payout occurred on-chain.

## 3. Key Features Implemented

- USDC transfers on Solana Devnet
- Automatic Associated Token Account creation for recipients
- Treasury balance validation before transfer
- Finalized transaction confirmation
- Transaction signature logging
- Solana Explorer link generation
- Reusable TypeScript transfer function
- Detailed error handling for failed payout cases

## 4. Code Structure

### `lib/solana/connection.ts`

Creates and exports the Solana RPC connection.

Responsibilities:

- Reads `SOLANA_RPC_URL` from environment variables.
- Connects to Solana Devnet.
- Provides a shared `Connection` instance for transfer operations.
- Sets default commitment behavior for reliable reads and transaction submission.

### `lib/solana/wallet.ts`

Loads the treasury wallet used to sign payouts.

Responsibilities:

- Reads `TREASURY_WALLET_SECRET_KEY` from environment variables.
- Decodes the base58 private key.
- Creates a Solana `Keypair`.
- Exports the treasury keypair for payout execution.

### `lib/solana/tokens.ts`

Contains SPL token configuration and token-account helpers.

Responsibilities:

- Defines the Devnet USDC mint address.
- Defines USDC decimal precision.
- Provides helper functions for deriving Associated Token Accounts.
- Ensures transfer logic always uses the correct SPL token mint.

### `lib/solana/transfer.ts`

Implements the reusable USDC transfer function.

Responsibilities:

- Exports `transferUSDC`.
- Converts human-readable USDC amounts into smallest token units.
- Validates recipient wallet addresses.
- Finds source and recipient token accounts.
- Creates the recipient ATA when missing.
- Checks treasury USDC balance before submitting a transaction.
- Builds the SPL-token transfer instruction.
- Signs the transaction with the treasury wallet.
- Sends and confirms the transaction with finalized commitment.
- Returns the finalized transaction signature.

### `scripts/test-transfer.ts`

Provides a direct test script for validating real Devnet transfers.

Responsibilities:

- Loads environment variables.
- Reads test recipient and amount values.
- Calls `transferUSDC`.
- Logs the finalized transaction signature.
- Logs a Solana Explorer URL for verification.

## 5. Environment Configuration

Required environment variables:

```env
SOLANA_RPC_URL=
TREASURY_WALLET_SECRET_KEY=
TEST_RECIPIENT_WALLET=
TEST_TRANSFER_AMOUNT_USDC=0.01
```

### `SOLANA_RPC_URL`

The Solana RPC endpoint used by the payout engine.

Expected format:

```text
https://api.devnet.solana.com
```

A hosted RPC provider such as Helius or QuickNode can also be used for better reliability.

### `TREASURY_WALLET_SECRET_KEY`

The private key for the treasury wallet that signs payout transactions.

Expected format:

```text
Base58-encoded 64-byte Solana secret key
```

This should be the full secret key for a Solana `Keypair`, not a seed phrase and not a public wallet address.

Security note: this value must never be committed to Git. It should be stored only in local `.env` files for development and secure environment-variable storage in deployed environments.

### `TEST_RECIPIENT_WALLET`

The recipient contractor wallet used by the test transfer script.

Expected format:

```text
Solana public wallet address
```

### `TEST_TRANSFER_AMOUNT_USDC`

The amount of USDC to send when running the test script.

Expected format:

```text
Decimal USDC amount, for example 0.01
```

USDC uses 6 decimal places, so amounts more precise than 6 decimals are invalid.

## 6. Token Configuration

The Devnet USDC mint used by this module is:

```text
Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjusZaG9Vp2KGtKJr
```

The mint address matters because SPL tokens are identified by mint address, not by display name. Two tokens can both be named `USDC`, but if they have different mint addresses, they are completely different assets on-chain.

This is especially important on Devnet, where many faucet tokens and test mints may use the same symbol. The payout engine must use the exact mint that the treasury wallet holds and the recipient is expected to receive.

If the treasury wallet holds USDC from one mint and the transfer code uses another mint, the derived token accounts will not match and the payout will fail or appear to send a different token.

## 7. How the Transfer Works

### Amount Conversion

USDC uses 6 decimal places.

Example:

```text
1 USDC = 1,000,000 base units
0.01 USDC = 10,000 base units
```

The transfer function converts the human-readable amount into base units before building the token transfer instruction.

### Associated Token Accounts

SPL tokens are not held directly in a wallet address. They are held in token accounts.

For each wallet and mint pair, the standard token account is called an Associated Token Account, or ATA.

Example relationship:

```text
Wallet Address + USDC Mint -> USDC Associated Token Account
```

Before transferring, the engine derives:

- Treasury USDC ATA
- Recipient USDC ATA

If the recipient ATA does not exist, the engine creates it in the same transaction before transferring USDC.

### Transaction Building

The transaction may contain one or two instructions:

1. Create recipient ATA, if missing.
2. Transfer USDC from treasury ATA to recipient ATA.

The transfer instruction is created using `createTransferInstruction` from `@solana/spl-token`.

### Signing

The treasury wallet signs the transaction.

This proves that the platform treasury authorized the transfer. Without the treasury private key, the transaction cannot move funds from the treasury token account.

### Sending and Confirming

After signing, the raw transaction is sent to Solana Devnet.

The engine then waits for finalized confirmation before returning success.

### Finalized vs Confirmed

`confirmed` means the transaction has been voted on by the cluster and is highly likely to remain valid.

`finalized` means the transaction is rooted and considered irreversible under normal Solana network conditions.

For payroll and audit use cases, finalized confirmation is preferred because the transaction signature is stored as proof of payment.

## 8. How to Run the System

### 1. Set up `.env`

Create or update `.env`:

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
TREASURY_WALLET_SECRET_KEY=<base58-private-key>
TEST_RECIPIENT_WALLET=<recipient-wallet-address>
TEST_TRANSFER_AMOUNT_USDC=0.01
```

### 2. Fund the treasury wallet with SOL

The treasury wallet needs Devnet SOL to pay transaction fees and create token accounts.

Use a Devnet faucet or Solana CLI:

```bash
solana airdrop 1 <treasury-wallet-address> --url devnet
```

### 3. Fund the treasury wallet with USDC

Mint or request Devnet USDC for the configured mint:

```text
Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjusZaG9Vp2KGtKJr
```

The treasury wallet must hold this exact SPL token mint before transfers can succeed.

### 4. Run the test script

```bash
npm run test:transfer
```

The script reads `TEST_RECIPIENT_WALLET` and `TEST_TRANSFER_AMOUNT_USDC` from `.env`.

## 9. Example Output

Example successful logs:

```text
[scripts:test-transfer] Starting devnet USDC transfer {
  treasury: "TreasuryWalletPublicKey",
  recipient: "RecipientWalletPublicKey",
  amount: "0.01"
}

[solana:transfer] Preparing devnet USDC transfer
[solana:transfer] Source USDC balance
[solana:transfer] Sending transaction
[solana:transfer] Transaction submitted {
  signature: "5C4L6Z9ExampleTransactionSignature"
}
[solana:transfer] Transaction finalized {
  signature: "5C4L6Z9ExampleTransactionSignature"
}

[scripts:test-transfer] Transfer finalized {
  signature: "5C4L6Z9ExampleTransactionSignature"
}
[scripts:test-transfer] Explorer: https://explorer.solana.com/tx/5C4L6Z9ExampleTransactionSignature?cluster=devnet
```

## 10. Verification Guide

### Solana Explorer

Open the generated Explorer link:

```text
https://explorer.solana.com/tx/<transaction-signature>?cluster=devnet
```

Verify:

- Transaction status is successful.
- Cluster is Devnet.
- Token transfer instruction is present.
- Sender is the treasury token account.
- Recipient is the contractor token account.
- Mint matches the configured USDC mint.

### Balance Changes

Check the treasury wallet:

- USDC balance should decrease by the transfer amount.
- SOL balance may decrease slightly due to transaction fees and ATA creation rent.

Check the recipient wallet:

- USDC balance should increase by the transfer amount.
- If the recipient had no ATA before, a new token account should now exist.

### Recipient Wallet

In wallets such as Phantom:

- Switch to Devnet.
- Check the token list.
- If the token is not shown automatically, add the custom mint manually.

Phantom may label the token as an unknown asset because it is a custom Devnet mint.

## 11. Edge Cases Handled

### Insufficient Balance

Before submitting the transaction, the engine checks the treasury USDC token-account balance.

If the balance is too low, the function throws an error and does not submit a transaction.

### Missing ATA

If the recipient does not have an Associated Token Account for the configured USDC mint, the engine creates it automatically.

This makes payouts work for first-time recipients.

### Invalid Wallet Address

The recipient wallet address is parsed as a Solana `PublicKey`.

If parsing fails, the transfer is rejected before any transaction is built.

### Transaction Failure

If transaction submission or finalized confirmation fails, the engine logs the error and throws a transfer error.

This prevents the system from treating unconfirmed payouts as successful.

## 12. Known Limitations

- The current implementation is Devnet only.
- This MVP performs direct treasury-to-contractor transfers.
- Smart contract escrow is not included in the current implementation.
- The system relies on Devnet faucet tokens.
- Devnet tokens have no real monetary value.
- Phantom and other wallets may show the Devnet USDC mint as `Unknown Token`.
- Batch payouts are not yet implemented in this module.
- Split settlements and platform fees are not yet implemented.

## 13. Future Improvements

Planned improvements:

- Anchor escrow contracts for invoice-backed fund locking and release.
- Batch payouts to pay multiple contractors in a single execution flow.
- Split settlements for contractor payments and platform fees.
- Treasury automation for balance thresholds and idle fund policies.
- Helius webhook integration for payout and treasury event monitoring.
- Persistent payout status tracking in the database.
- Mainnet deployment using production USDC mint configuration.
- Retry and queue-based payout execution using a background worker.

## 14. Demo Explanation

For a hackathon demo, present this module as the proof that Borderless Payroll Copilot is not just a payroll UI. It executes real on-chain stablecoin payouts.

Suggested demo script:

```text
When an invoice is approved, our backend triggers the Solana Payout Engine.
The engine validates the treasury balance, creates the recipient token account if needed, signs the transaction with the treasury wallet, sends USDC on Solana Devnet, and waits for finalized confirmation.
The returned transaction signature becomes the proof of payment for the invoice and audit trail.
```

What to show:

1. The `.env` configuration with secret values hidden.
2. The treasury wallet funded with Devnet SOL and Devnet USDC.
3. Running `npm run test:transfer`.
4. The finalized transaction signature in the terminal.
5. The Solana Explorer page showing a successful Devnet token transfer.
6. The recipient wallet balance increasing after the payout.

Why it is impressive:

- It demonstrates real blockchain settlement, not mocked payment state.
- It produces an auditable transaction signature for every payout.
- It handles first-time recipients by creating token accounts automatically.
- It uses finalized confirmation, which is appropriate for payroll-grade proof.
- It shows how invoice approval can connect directly to programmable stablecoin settlement.
