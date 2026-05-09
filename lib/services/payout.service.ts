import { PublicKey } from "@solana/web3.js";
import type { Payout } from "@prisma/client";

import { prisma } from "../db/prisma";
import { logPayoutConfirmed, logPayoutFailed } from "./audit.service";
import { InvalidWalletAddressError } from "../solana/transfer";

const db = prisma as any;

type ExecutePayoutInput = {
  invoiceId: string;
  wallet: string;
  amount: number;
  companyId?: string;
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

export class PayoutInvoiceNotFoundError extends Error {
  constructor(invoiceId: string) {
    super(`Invoice ${invoiceId} not found.`);
    this.name = "PayoutInvoiceNotFoundError";
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

function getMockSolanaSignature(): string | undefined {
  if (process.env.NODE_ENV !== "test") {
    return undefined;
  }

  const signature = process.env.MOCK_SOLANA_TX_SIGNATURE?.trim();
  return signature || undefined;
}

export async function executePayout(
  input: ExecutePayoutInput,
): Promise<ExecutePayoutResult> {
  validateInput(input);

  const invoiceId = input.invoiceId.trim();
  const wallet = input.wallet.trim();
  const amount = input.amount;
  const expectedCompanyId =
    typeof input.companyId === "string" && input.companyId.trim()
      ? input.companyId.trim()
      : undefined;

  console.info("[payout:service] Received payout execution request", {
    invoiceId,
    wallet,
    amount,
  });

  const existingPayout = await db.payout.findUnique({
    where: { invoiceId },
  });

  if (existingPayout?.status === "CONFIRMED" && existingPayout.txSignature) {
    console.info("[payout:service] Returning existing confirmed payout", {
      invoiceId,
      payoutId: existingPayout.id,
      txSignature: existingPayout.txSignature,
    });

    await db.invoice.update({
      where: { id: invoiceId },
      data: { status: "PAID" },
    });

    return {
      payoutId: existingPayout.id,
      txHash: existingPayout.txSignature,
      status: "CONFIRMED",
    };
  }

  if (existingPayout?.status === "PENDING") {
    console.warn("[payout:service] Duplicate payout blocked", {
      invoiceId,
      payoutId: existingPayout.id,
      status: existingPayout.status,
      txSignature: existingPayout.txSignature,
    });
    throw new DuplicatePayoutError(invoiceId);
  }

  let payout: Payout;
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      companyId: true,
      contractorId: true,
      status: true,
      approvedAt: true,
    },
  });

  if (!invoice) {
    throw new PayoutInvoiceNotFoundError(invoiceId);
  }

  if (expectedCompanyId && invoice.companyId !== expectedCompanyId) {
    throw new PayoutInvoiceNotFoundError(invoiceId);
  }

  if (!["PENDING", "APPROVED"].includes(invoice.status)) {
    throw new PayoutValidationError(
      `Invoice ${invoiceId} is ${invoice.status}; only PENDING or APPROVED invoices can be paid.`,
    );
  }

  try {
    if (existingPayout?.status === "FAILED") {
      payout = await db.payout.update({
        where: { id: existingPayout.id },
        data: {
          companyId: invoice.companyId,
          contractorId: invoice.contractorId,
          contractorWallet: wallet,
          amountUsdc: amount.toString(),
          currency: "USDC",
          status: "PENDING",
          txSignature: null,
          escrowPda: null,
          executedAt: null,
        },
      });
    } else {
      payout = await db.payout.create({
        data: {
          companyId: invoice.companyId,
          contractorId: invoice.contractorId,
          invoiceId,
          contractorWallet: wallet,
          amountUsdc: amount.toString(),
          currency: "USDC",
          status: "PENDING",
        },
      });
    }
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
  let escrowPda: string | null = payout.escrowPda ?? null;

  try {
    console.info("[payout:service] Executing escrow-backed payout", {
      invoiceId,
      payoutId: payout.id,
      wallet,
      amount,
    });

    const mockSignature = getMockSolanaSignature();

    if (mockSignature) {
      txHash = mockSignature;
    } else {
      const { depositEscrow, initializeEscrow, releaseEscrow } = await import("../solana/escrow");
      const initialized = await initializeEscrow({ invoiceId });
      escrowPda = initialized.escrowPda;
      await db.payout.update({
        where: { id: payout.id },
        data: { escrowPda },
      });

      const deposited = await depositEscrow({ invoiceId, amount });
      const released = await releaseEscrow({
        invoiceId,
        contractorWallet: wallet,
      });

      escrowPda = released.escrowPda;
      await db.payout.update({
        where: { id: payout.id },
        data: { escrowPda },
      });

      console.info("[payout:service] Escrow lifecycle completed", {
        invoiceId,
        payoutId: payout.id,
        escrowPda,
        initializeSignature: initialized.signature ?? null,
        depositSignature: deposited.signature ?? null,
        releaseSignature: released.signature,
      });

      txHash = released.signature;
    }
  } catch (error) {
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: "FAILED",
      },
    });

    const message = getErrorMessage(error);

    if (invoice.companyId) {
      await logPayoutFailed({
        companyId: invoice.companyId,
        metadata: {
          payoutId: payout.id,
          invoiceId,
          wallet,
          amount,
          escrowPda,
          error: message,
        },
      }).catch(() => undefined);
    }

    console.error("[payout:service] Payout failed", {
      payoutId: payout.id,
      invoiceId,
      wallet,
      amount,
      escrowPda,
      error: message,
    });

    if (error instanceof InvalidWalletAddressError) {
      throw error;
    }

    throw new PayoutExecutionError(message, {
      payoutId: payout.id,
      cause: error,
    });
  }

  try {
    const paidAt = new Date();

    await prisma.$transaction([
      db.payout.update({
        where: { id: payout.id },
        data: {
          status: "CONFIRMED",
          txSignature: txHash,
          escrowPda,
          executedAt: paidAt,
        },
      }),
      db.invoice.update({
        where: { id: invoiceId },
        data: {
          status: "PAID",
          approvedAt: invoice.approvedAt ?? paidAt,
        },
      }),
    ]);

    console.info("[payout:service] Payout confirmed", {
      payoutId: payout.id,
      invoiceId,
      txHash,
    });

    if (invoice.companyId) {
      await logPayoutConfirmed({
        companyId: invoice.companyId,
        metadata: {
          payoutId: payout.id,
          invoiceId,
          txHash,
          escrowPda,
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
      `Payout transaction confirmed, but the database confirmation update failed. txHash=${txHash}. ${message}`,
      {
        payoutId: payout.id,
        cause: error,
      },
    );
  }
}
