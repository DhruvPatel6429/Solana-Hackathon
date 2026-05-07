import {
  Keypair,
  PublicKey,
  SendTransactionError,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { connection } from "./connection";
import { DEVNET_USDC_MINT, getUSDCAccount, USDC_DECIMALS } from "./tokens";

export type TransferUSDCParams = {
  fromWallet: Keypair;
  toWallet: PublicKey | string;
  amount: number | string;
};

export type TransferWithSplitParams = {
  contractorWallet: PublicKey | string;
  feeWallet: PublicKey | string;
  amount: number | string;
};

export type TransferWithSplitResult = {
  signature: string;
};

export class SolanaTransferError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SolanaTransferError";
    this.cause = cause;
  }
}

export class InvalidWalletAddressError extends SolanaTransferError {
  constructor(wallet: string, cause?: unknown, label = "recipient") {
    super(`[solana:transfer] Invalid ${label} wallet address: ${wallet}`, cause);
    this.name = "InvalidWalletAddressError";
  }
}

export class InsufficientBalanceError extends SolanaTransferError {
  constructor(requiredBaseUnits: bigint, availableBaseUnits: bigint) {
    super(
      `[solana:transfer] Insufficient USDC balance. Required ${formatUSDC(
        requiredBaseUnits,
      )} USDC, available ${formatUSDC(availableBaseUnits)} USDC.`,
    );
    this.name = "InsufficientBalanceError";
  }
}

function parseWallet(wallet: PublicKey | string, label = "recipient"): PublicKey {
  if (wallet instanceof PublicKey) {
    return wallet;
  }

  try {
    return new PublicKey(wallet);
  } catch (error) {
    throw new InvalidWalletAddressError(wallet, error, label);
  }
}

function toUSDCBaseUnits(amount: number | string): bigint {
  const value =
    typeof amount === "number" ? amount.toString() : amount.trim();

  if (!value) {
    throw new SolanaTransferError("[solana:transfer] Amount is required.");
  }

  if (value.includes("e") || value.includes("E")) {
    throw new SolanaTransferError(
      "[solana:transfer] Amount must be a decimal value, not scientific notation.",
    );
  }

  const match = value.match(/^(?:(\d+)(?:\.(\d*))?|\.(\d+))$/);

  if (!match) {
    throw new SolanaTransferError(
      `[solana:transfer] Invalid USDC amount: ${value}`,
    );
  }

  const whole = match[1] ?? "0";
  const fraction = match[2] ?? match[3] ?? "";

  if (fraction.length > USDC_DECIMALS) {
    throw new SolanaTransferError(
      `[solana:transfer] USDC supports ${USDC_DECIMALS} decimal places. Received ${fraction.length}.`,
    );
  }

  const baseUnits =
    BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) +
    BigInt(fraction.padEnd(USDC_DECIMALS, "0") || "0");

  if (baseUnits <= 0n) {
    throw new SolanaTransferError(
      "[solana:transfer] Amount must be greater than zero.",
    );
  }

  return baseUnits;
}

function formatUSDC(baseUnits: bigint): string {
  const scale = 10n ** BigInt(USDC_DECIMALS);
  const whole = baseUnits / scale;
  const fraction = (baseUnits % scale).toString().padStart(USDC_DECIMALS, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");

  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString();
}

async function getTokenBalanceBaseUnits(tokenAccount: PublicKey): Promise<bigint> {
  const balance = await connection.getTokenAccountBalance(tokenAccount);
  return BigInt(balance.value.amount);
}

function assertTokenProgramOwner(accountLabel: string, owner: PublicKey): void {
  if (!owner.equals(TOKEN_PROGRAM_ID)) {
    throw new SolanaTransferError(
      `[solana:transfer] ${accountLabel} exists but is not owned by the SPL Token program.`,
    );
  }
}

function assertPositiveSplitAmount(label: string, amountBaseUnits: bigint): void {
  if (amountBaseUnits <= 0n) {
    throw new SolanaTransferError(
      `[solana:transfer] Amount is too small to allocate a positive ${label} split.`,
    );
  }
}

export async function transferUSDC({
  fromWallet,
  toWallet,
  amount,
}: TransferUSDCParams): Promise<string> {
  const recipient = parseWallet(toWallet);
  const amountBaseUnits = toUSDCBaseUnits(amount);
  const sourceTokenAccount = getUSDCAccount(fromWallet.publicKey);
  const recipientTokenAccount = getUSDCAccount(recipient);

  console.info("[solana:transfer] Preparing devnet USDC transfer", {
    mint: DEVNET_USDC_MINT.toBase58(),
    fromWallet: fromWallet.publicKey.toBase58(),
    toWallet: recipient.toBase58(),
    amount: formatUSDC(amountBaseUnits),
    amountBaseUnits: amountBaseUnits.toString(),
    sourceTokenAccount: sourceTokenAccount.toBase58(),
    recipientTokenAccount: recipientTokenAccount.toBase58(),
  });

  try {
    const [sourceAccountInfo, recipientAccountInfo] = await Promise.all([
      connection.getAccountInfo(sourceTokenAccount),
      connection.getAccountInfo(recipientTokenAccount),
    ]);

    if (!sourceAccountInfo) {
      throw new InsufficientBalanceError(amountBaseUnits, 0n);
    }

    assertTokenProgramOwner("Source token account", sourceAccountInfo.owner);

    if (recipientAccountInfo) {
      assertTokenProgramOwner(
        "Recipient token account",
        recipientAccountInfo.owner,
      );
    }

    const sourceBalance = await getTokenBalanceBaseUnits(sourceTokenAccount);

    console.info("[solana:transfer] Source USDC balance", {
      tokenAccount: sourceTokenAccount.toBase58(),
      balance: formatUSDC(sourceBalance),
      balanceBaseUnits: sourceBalance.toString(),
    });

    if (sourceBalance < amountBaseUnits) {
      throw new InsufficientBalanceError(amountBaseUnits, sourceBalance);
    }

    const transaction = new Transaction();

    if (!recipientAccountInfo) {
      console.info("[solana:transfer] Recipient ATA missing; creating it", {
        recipientTokenAccount: recipientTokenAccount.toBase58(),
      });

      transaction.add(
        createAssociatedTokenAccountInstruction(
          fromWallet.publicKey,
          recipientTokenAccount,
          recipient,
          DEVNET_USDC_MINT,
        ),
      );
    }

    transaction.add(
      createTransferInstruction(
        sourceTokenAccount,
        recipientTokenAccount,
        fromWallet.publicKey,
        amountBaseUnits,
      ),
    );

    const latestBlockhash = await connection.getLatestBlockhash("finalized");
    transaction.feePayer = fromWallet.publicKey;
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.sign(fromWallet);

    console.info("[solana:transfer] Sending transaction", {
      instructionCount: transaction.instructions.length,
    });

    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        preflightCommitment: "confirmed",
        skipPreflight: false,
      },
    );

    console.info("[solana:transfer] Transaction submitted", { signature });

    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "finalized",
    );

    if (confirmation.value.err) {
      throw new SolanaTransferError(
        `[solana:transfer] Transaction failed during finalized confirmation: ${JSON.stringify(
          confirmation.value.err,
        )}`,
      );
    }

    console.info("[solana:transfer] Transaction finalized", { signature });
    return signature;
  } catch (error) {
    if (error instanceof SolanaTransferError) {
      console.error(error.message);
      throw error;
    }

    if (error instanceof SendTransactionError) {
      const logs = await error.getLogs(connection).catch(() => undefined);
      console.error("[solana:transfer] Send transaction failed", {
        message: error.message,
        logs,
      });
      throw new SolanaTransferError(
        `[solana:transfer] Failed to send USDC transfer: ${error.message}`,
        error,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[solana:transfer] Transfer failed", { message });
    throw new SolanaTransferError(
      `[solana:transfer] Failed to transfer USDC: ${message}`,
      error,
    );
  }
}

export async function transferWithSplit({
  contractorWallet,
  feeWallet,
  amount,
}: TransferWithSplitParams): Promise<TransferWithSplitResult> {
  const contractor = parseWallet(contractorWallet, "contractor");
  const feeRecipient = parseWallet(feeWallet, "fee");
  const totalBaseUnits = toUSDCBaseUnits(amount);
  const contractorBaseUnits = (totalBaseUnits * 95n) / 100n;
  const feeBaseUnits = totalBaseUnits - contractorBaseUnits;

  assertPositiveSplitAmount("contractor", contractorBaseUnits);
  assertPositiveSplitAmount("fee", feeBaseUnits);

  const { treasuryWallet } = await import("./wallet");
  const sourceTokenAccount = getUSDCAccount(treasuryWallet.publicKey);
  const contractorTokenAccount = getUSDCAccount(contractor);
  const feeTokenAccount = getUSDCAccount(feeRecipient);

  console.info("[solana:split-transfer] Preparing split settlement", {
    mint: DEVNET_USDC_MINT.toBase58(),
    treasuryWallet: treasuryWallet.publicKey.toBase58(),
    contractorWallet: contractor.toBase58(),
    feeWallet: feeRecipient.toBase58(),
    totalAmount: formatUSDC(totalBaseUnits),
    contractorAmount: formatUSDC(contractorBaseUnits),
    contractorAmountBaseUnits: contractorBaseUnits.toString(),
    feeAmount: formatUSDC(feeBaseUnits),
    feeAmountBaseUnits: feeBaseUnits.toString(),
    sourceTokenAccount: sourceTokenAccount.toBase58(),
    contractorTokenAccount: contractorTokenAccount.toBase58(),
    feeTokenAccount: feeTokenAccount.toBase58(),
  });

  try {
    const [sourceAccountInfo, contractorAccountInfo, feeAccountInfo] =
      await Promise.all([
        connection.getAccountInfo(sourceTokenAccount),
        connection.getAccountInfo(contractorTokenAccount),
        connection.getAccountInfo(feeTokenAccount),
      ]);

    if (!sourceAccountInfo) {
      throw new InsufficientBalanceError(totalBaseUnits, 0n);
    }

    assertTokenProgramOwner("Source token account", sourceAccountInfo.owner);

    if (contractorAccountInfo) {
      assertTokenProgramOwner(
        "Contractor token account",
        contractorAccountInfo.owner,
      );
    }

    if (feeAccountInfo) {
      assertTokenProgramOwner("Fee token account", feeAccountInfo.owner);
    }

    const sourceBalance = await getTokenBalanceBaseUnits(sourceTokenAccount);

    console.info("[solana:split-transfer] Source USDC balance", {
      tokenAccount: sourceTokenAccount.toBase58(),
      balance: formatUSDC(sourceBalance),
      balanceBaseUnits: sourceBalance.toString(),
    });

    if (sourceBalance < totalBaseUnits) {
      throw new InsufficientBalanceError(totalBaseUnits, sourceBalance);
    }

    const transaction = new Transaction();
    const createdTokenAccounts = new Set<string>();

    if (!contractorAccountInfo) {
      const tokenAccount = contractorTokenAccount.toBase58();

      if (!createdTokenAccounts.has(tokenAccount)) {
        console.info(
          "[solana:split-transfer] Contractor ATA missing; creating it",
          {
            contractorTokenAccount: tokenAccount,
          },
        );

        transaction.add(
          createAssociatedTokenAccountInstruction(
            treasuryWallet.publicKey,
            contractorTokenAccount,
            contractor,
            DEVNET_USDC_MINT,
          ),
        );
        createdTokenAccounts.add(tokenAccount);
      }
    }

    if (!feeAccountInfo) {
      const tokenAccount = feeTokenAccount.toBase58();

      if (!createdTokenAccounts.has(tokenAccount)) {
        console.info("[solana:split-transfer] Fee ATA missing; creating it", {
          feeTokenAccount: tokenAccount,
        });

        transaction.add(
          createAssociatedTokenAccountInstruction(
            treasuryWallet.publicKey,
            feeTokenAccount,
            feeRecipient,
            DEVNET_USDC_MINT,
          ),
        );
        createdTokenAccounts.add(tokenAccount);
      }
    }

    transaction.add(
      createTransferInstruction(
        sourceTokenAccount,
        contractorTokenAccount,
        treasuryWallet.publicKey,
        contractorBaseUnits,
      ),
      createTransferInstruction(
        sourceTokenAccount,
        feeTokenAccount,
        treasuryWallet.publicKey,
        feeBaseUnits,
      ),
    );

    const latestBlockhash = await connection.getLatestBlockhash("finalized");
    transaction.feePayer = treasuryWallet.publicKey;
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.sign(treasuryWallet);

    console.info("[solana:split-transfer] Sending atomic split transaction", {
      contractorAmount: formatUSDC(contractorBaseUnits),
      feeAmount: formatUSDC(feeBaseUnits),
      instructionCount: transaction.instructions.length,
    });

    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        preflightCommitment: "confirmed",
        skipPreflight: false,
      },
    );

    console.info("[solana:split-transfer] Transaction submitted", {
      signature,
    });

    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "finalized",
    );

    if (confirmation.value.err) {
      throw new SolanaTransferError(
        `[solana:split-transfer] Transaction failed during finalized confirmation: ${JSON.stringify(
          confirmation.value.err,
        )}`,
      );
    }

    console.info("[solana:split-transfer] Transaction finalized", {
      signature,
    });

    return { signature };
  } catch (error) {
    if (error instanceof SolanaTransferError) {
      console.error(error.message);
      throw error;
    }

    if (error instanceof SendTransactionError) {
      const logs = await error.getLogs(connection).catch(() => undefined);
      console.error("[solana:split-transfer] Send transaction failed", {
        message: error.message,
        logs,
      });
      throw new SolanaTransferError(
        `[solana:split-transfer] Failed to send split transfer: ${error.message}`,
        error,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[solana:split-transfer] Split transfer failed", { message });
    throw new SolanaTransferError(
      `[solana:split-transfer] Failed to transfer split USDC: ${message}`,
      error,
    );
  }
}
