import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { InvoiceStatus } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  contractorId: string;
  companyId: string;
  amountUsdc: number;
  /** ISO date string for work period start */
  workPeriodStart: string;
  /** ISO date string for work period end */
  workPeriodEnd: string;
  lineItems: LineItem[];
  currency?: string;
  notes?: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface RejectInvoiceInput {
  invoiceId: string;
  reason: string;
  adminId: string;
}

export interface ApproveInvoiceInput {
  invoiceId: string;
  adminId: string;
}

export interface ListInvoicesFilter {
  companyId?: string;
  contractorId?: string;
  status?: InvoiceStatus;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  pageSize?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deterministically hash the invoice content for on-chain anchoring.
 * Hash covers: contractorId, companyId, amountUsdc, lineItems, workPeriod.
 */
function computeInvoiceHash(input: CreateInvoiceInput): string {
  const payload = JSON.stringify({
    contractorId: input.contractorId,
    companyId: input.companyId,
    amountUsdc: input.amountUsdc,
    workPeriodStart: input.workPeriodStart,
    workPeriodEnd: input.workPeriodEnd,
    lineItems: input.lineItems,
  });
  return createHash("sha256").update(payload).digest("hex");
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Create a new invoice.
 * Computes a SHA-256 hash of the invoice content and stores it for
 * proof-of-invoice anchoring.
 *
 * Note: amountUsdc is stored as Decimal in the database to avoid floating-point
 * arithmetic errors. Input is a number but converted to string for Prisma.
 */
export async function createInvoice(input: CreateInvoiceInput) {
  const invoiceHash = computeInvoiceHash(input);

  const invoice = await prisma.invoice.create({
    data: {
      contractorId: input.contractorId,
      companyId: input.companyId,
      amountUsdc: input.amountUsdc.toString(),
      status: InvoiceStatus.PENDING,
      invoiceHash,
      submittedAt: new Date(),
      // Store rich metadata as JSON in a notes/metadata field if your schema
      // supports it; otherwise extend the Prisma schema with these columns.
      ...(input.notes ? { notes: input.notes } : {}),
    },
    include: {
      contractor: true,
    },
  });

  return invoice;
}

/**
 * Fetch a single invoice by ID, scoped to the given companyId for
 * multi-tenant safety.
 */
export async function getInvoiceById(invoiceId: string, companyId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      companyId,
    },
    include: {
      contractor: true,
      payouts: true,
    },
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  return invoice;
}

/**
 * List invoices with optional filters, pagination, and sorting.
 * Scoped to companyId or contractorId depending on the caller.
 */
export async function listInvoices(filter: ListInvoicesFilter) {
  const {
    companyId,
    contractorId,
    status,
    fromDate,
    toDate,
    page = 1,
    pageSize = 20,
  } = filter;

  const where: Record<string, unknown> = {};

  if (companyId) where.companyId = companyId;
  if (contractorId) where.contractorId = contractorId;
  if (status) where.status = status;
  if (fromDate || toDate) {
    where.submittedAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: {
        contractor: { select: { id: true, name: true, country: true } },
        payouts: { select: { id: true, txSignature: true, status: true } },
      },
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    invoices: invoices.map((invoice) => ({
      ...invoice,
      payouts: invoice.payouts.map((payout) => ({
        id: payout.id,
        solanaTxSignature: payout.txSignature,
        status: payout.status,
      })),
    })),
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Approve an invoice.
 * Sets status to APPROVED, records approvedAt timestamp.
 * Caller (the API route) is responsible for triggering the Solana payout
 * via payout.service.ts after this returns.
 *
 * Returns the updated invoice so the route can pass it to the payout engine.
 */
export async function approveInvoice(input: ApproveInvoiceInput) {
  const { invoiceId, adminId } = input;

  // Load the invoice first to validate current state
  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { contractor: true },
  });

  if (!existing) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  if (existing.status !== InvoiceStatus.PENDING) {
    throw new Error(
      `Invoice ${invoiceId} is already ${existing.status} — only PENDING invoices can be approved`
    );
  }

  const invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: InvoiceStatus.APPROVED,
      approvedAt: new Date(),
    },
    include: {
      contractor: true,
    },
  });

  // Write to audit log
  await prisma.auditLog.create({
    data: {
      companyId: invoice.companyId,
      action: "INVOICE_APPROVED",
      actorUserId: adminId,
      metadata: {
        invoiceId,
        contractorId: invoice.contractorId,
        amountUsdc: invoice.amountUsdc,
      },
    },
  });

  return invoice;
}

/**
 * Reject an invoice with an admin-supplied reason.
 * Sets status to REJECTED. No funds move on-chain.
 * Caller should send the rejection email notification after this returns.
 */
export async function rejectInvoice(input: RejectInvoiceInput) {
  const { invoiceId, reason, adminId } = input;

  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { contractor: true },
  });

  if (!existing) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  if (existing.status !== InvoiceStatus.PENDING) {
    throw new Error(
      `Invoice ${invoiceId} is already ${existing.status} — only PENDING invoices can be rejected`
    );
  }

  const invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: InvoiceStatus.REJECTED,
      // Store rejection reason — add `rejectionReason String?` to your Prisma
      // schema if not already present.
      rejectionReason: reason,
    },
    include: {
      contractor: true,
    },
  });

  // Write to audit log
  await prisma.auditLog.create({
    data: {
      companyId: invoice.companyId,
      action: "INVOICE_REJECTED",
      actorUserId: adminId,
      metadata: {
        invoiceId,
        contractorId: invoice.contractorId,
        amountUsdc: invoice.amountUsdc,
        reason,
      },
    },
  });

  return invoice;
}

/**
 * Mark an invoice as PAID after the Solana payout has been confirmed.
 * Called by payout.service.ts once the tx is finalised on-chain.
 */
export async function markInvoicePaid(invoiceId: string) {
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: InvoiceStatus.PAID },
  });
}
