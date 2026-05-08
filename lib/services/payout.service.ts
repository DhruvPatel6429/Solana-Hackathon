import { PublicKey } from "@solana/web3.js";
import type { Payout } from "@prisma/client";

import { prisma } from "../db/prisma";
import { logPayoutConfirmed, logPayoutFailed } from "./audit.service";
import {
  deriveEscrowPda,
  EscrowAlreadyReleasedError,
  EscrowNotFoundError,
  EscrowReleaseError,
  releaseEscrow,
} from "../solana/escrow";
import {
  InvalidWalletAddressError,
} from "../solana/transfer";

type ExecutePayoutInput = {
  invoiceId: string;
  wallet: string;
  amount: number;
};

type ExecutePayoutResult = {
  payoutId: string;
  txHash: string;
  status: "CONFIRMED";
};

export class PayoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutValidationError";
  }
}

export class DuplicatePayoutError extends Error {
  constructor(invoiceId: string) {
    super(`Payout has already been created for invoice ${invoiceId}.`);
    this.name = "DuplicatePayoutError";
  }
}

export class PayoutExecutionError extends Error {
  public readonly payoutId?: string;
  public readonly cause?: unknown;

  constructor(message: string, options?: { payoutId?: string; cause?: unknown }) {
    super(message);
    this.name = "PayoutExecutionError";
    this.payoutId = options?.payoutId;
    this.cause = options?.cause;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function validateInput({ invoiceId, wallet, amount }: ExecutePayoutInput): void {
  if (!invoiceId || typeof invoiceId !== "string" || !invoiceId.trim()) {
    throw new PayoutValidationError("invoiceId is required.");
  }

  if (!wallet || typeof wallet !== "string" || !wallet.trim()) {
    throw new PayoutValidationError("wallet is required.");
  }

  try {
    new PublicKey(wallet);
  } catch (error) {
    throw new InvalidWalletAddressError(wallet, error);
  }

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new PayoutValidationError("amount must be a positive number.");
  }
}

export async function executePayout(
  input: ExecutePayoutInput,
): Promise<ExecutePayoutResult> {
  validateInput(input);

  const invoiceId = input.invoiceId.trim();
  const wallet = input.wallet.trim();
  const amount = input.amount;

  console.info("[payout:service] Received payout execution request", {
    invoiceId,
    wallet,
    amount,
  });

  const existingPayout = await prisma.payout.findUnique({
    where: { invoiceId },
  });

  if (existingPayout) {
    console.warn("[payout:service] Duplicate payout blocked", {
      invoiceId,
      payoutId: existingPayout.id,
      status: existingPayout.status,
      txSignature: existingPayout.txSignature,
    });
    throw new DuplicatePayoutError(invoiceId);
  }

  let payout: Payout;
  const escrowPda = deriveEscrowPda(invoiceId).escrowPda.toBase58();
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      companyId: true,
      contractorId: true,
    },
  });

  try {
    payout = await prisma.payout.create({
      data: {
        companyId: invoice?.companyId,
        contractorId: invoice?.contractorId,
        invoiceId,
        contractorWallet: wallet,
        amountUsdc: amount,
        escrowPda,
        status: "PENDING",
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicatePayoutError(invoiceId);
    }

    throw error;
  }

  console.info("[payout:service] Payout record created", {
    payoutId: payout.id,
    invoiceId,
    status: payout.status,
  });

  let txHash: string;

  try {
    console.info("[payout:service] Releasing escrow", {
      escrowPda,
      invoiceId,
    });

    const releaseResult = await releaseEscrow({
      invoiceId,
      contractorWallet: wallet,
    });

    txHash = releaseResult.signature;
  } catch (error) {
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: "FAILED",
      },
    });

    const message = getErrorMessage(error);

    if (invoice?.companyId) {
      await logPayoutFailed({
        companyId: invoice.companyId,
        metadata: {
          payoutId: payout.id,
          invoiceId,
          wallet,
          amount,
          error: message,
        },
      }).catch(() => undefined);
    }

    console.error("[payout:service] Payout failed", {
      payoutId: payout.id,
      invoiceId,
      wallet,
      amount,
      error: message,
    });

    if (
      error instanceof InvalidWalletAddressError ||
      error instanceof EscrowNotFoundError ||
      error instanceof EscrowAlreadyReleasedError ||
      error instanceof EscrowReleaseError
    ) {
      throw error;
    }

    throw new PayoutExecutionError(message, {
      payoutId: payout.id,
      cause: error,
    });
  }

  try {
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: "CONFIRMED",
        txSignature: txHash,
        escrowPda,
        executedAt: new Date(),
      },
    });

    console.info("[payout:service] Payout confirmed", {
      payoutId: payout.id,
      invoiceId,
      txHash,
    });

    if (invoice?.companyId) {
      await logPayoutConfirmed({
        companyId: invoice.companyId,
        metadata: {
          payoutId: payout.id,
          invoiceId,
          txHash,
        },
      }).catch(() => undefined);
    }

    return {
      payoutId: payout.id,
      txHash,
      status: "CONFIRMED",
    };
  } catch (error) {
    const message = getErrorMessage(error);

    console.error(
      "[payout:service] Payout confirmed on-chain but DB update failed",
      {
        payoutId: payout.id,
        invoiceId,
        txHash,
        error: message,
      },
    );

    throw new PayoutExecutionError(
      `Payout transaction finalized, but the database confirmation update failed. txHash=${txHash}. ${message}`,
      {
        payoutId: payout.id,
        cause: error,
      },
    );
  }
}
