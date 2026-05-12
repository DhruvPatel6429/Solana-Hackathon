import { NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const db = prisma as any;

function recentWithinDays(date: Date | null | undefined, days: number) {
  if (!date) return false;
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

export async function GET(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdmin>>;

  try {
    admin = await requireAdmin(request);
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  try {
    const company = await db.company.findUnique({
      where: { id: admin.companyId },
      select: {
        id: true,
        name: true,
        planTier: true,
        dodoCustomerId: true,
        dodoSubscriptionId: true,
        treasuryWalletAddress: true,
        feeWalletAddress: true,
        treasuryBalanceUsdc: true,
        treasuryBalanceUpdatedAt: true,
        createdAt: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const [billingEvents, webhookEvents, treasuryTransactions, invoiceSummary, payoutSummary, recentPayouts] =
      await Promise.all([
        db.billingEvent.findMany({
          where: { companyId: admin.companyId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        db.webhookEvent.findMany({
          where: { companyId: admin.companyId },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
        db.treasuryTransaction.findMany({
          where: { companyId: admin.companyId },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        db.invoice.groupBy({
          by: ["status"],
          where: { companyId: admin.companyId },
          _count: { status: true },
        }),
        db.payout.groupBy({
          by: ["status"],
          where: { companyId: admin.companyId },
          _count: { status: true },
        }),
        db.payout.findMany({
          where: { companyId: admin.companyId },
          include: {
            contractor: {
              select: {
                name: true,
              },
            },
          },
          orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
          take: 5,
        }),
      ]);

    const latestBillingEvent = billingEvents[0] ?? null;
    const latestDodoWebhook = webhookEvents.find((event: any) => event.provider === "dodo") ?? null;
    const latestHeliusWebhook = webhookEvents.find((event: any) => event.provider === "helius") ?? null;

    const invoiceCounts = invoiceSummary.reduce(
      (acc: Record<string, number>, item: any) => {
        acc[item.status] = item._count.status;
        return acc;
      },
      {},
    );
    const payoutCounts = payoutSummary.reduce(
      (acc: Record<string, number>, item: any) => {
        acc[item.status] = item._count.status;
        return acc;
      },
      {},
    );

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        planTier: company.planTier ?? "Growth",
        createdAt: company.createdAt,
        treasuryWalletAddress: company.treasuryWalletAddress,
        treasuryBalanceUsdc: Number(company.treasuryBalanceUsdc ?? 0),
        treasuryBalanceUpdatedAt: company.treasuryBalanceUpdatedAt,
        feeWalletAddress: company.feeWalletAddress,
      },
      billing: {
        customerId: company.dodoCustomerId,
        subscriptionId: company.dodoSubscriptionId,
        status:
          latestBillingEvent?.status ??
          (company.dodoSubscriptionId ? "active" : "pending_checkout"),
        webhookSync:
          latestDodoWebhook?.processed && recentWithinDays(latestDodoWebhook.processedAt, 7)
            ? "confirmed"
            : latestDodoWebhook
              ? "stale"
              : "pending",
        latestEventAt: latestBillingEvent?.createdAt ?? latestDodoWebhook?.createdAt ?? null,
        latestPaymentId: latestBillingEvent?.dodoPaymentId ?? null,
        recentEvents: billingEvents.map((event: any) => ({
          id: event.id,
          dodoPaymentId: event.dodoPaymentId,
          amountUsd: Number(event.amountUsd ?? 0),
          currency: event.currency,
          status: event.status,
          createdAt: event.createdAt,
        })),
      },
      treasury: {
        walletAddress: company.treasuryWalletAddress,
        balanceUsdc: Number(company.treasuryBalanceUsdc ?? 0),
        updatedAt: company.treasuryBalanceUpdatedAt,
        webhookSync:
          latestHeliusWebhook?.processed && recentWithinDays(latestHeliusWebhook.processedAt, 7)
            ? "confirmed"
            : latestHeliusWebhook
              ? "stale"
              : "pending",
        latestTransactions: treasuryTransactions.map((tx: any) => ({
          id: tx.id,
          signature: tx.signature,
          walletAddress: tx.walletAddress,
          amountUsdc: Number(tx.amountUsdc ?? 0),
          direction: tx.direction,
          source: tx.source,
          destination: tx.destination,
          createdAt: tx.createdAt,
        })),
      },
      webhooks: {
        latestEvents: webhookEvents.map((event: any) => ({
          id: event.id,
          provider: event.provider,
          eventType: event.eventType,
          externalId: event.externalId,
          processed: event.processed,
          processedAt: event.processedAt,
          createdAt: event.createdAt,
        })),
      },
      operations: {
        invoiceCounts: {
          pending: invoiceCounts.PENDING ?? 0,
          approved: invoiceCounts.APPROVED ?? 0,
          rejected: invoiceCounts.REJECTED ?? 0,
          paid: invoiceCounts.PAID ?? 0,
        },
        payoutCounts: {
          pending: payoutCounts.PENDING ?? 0,
          confirmed: payoutCounts.CONFIRMED ?? 0,
          failed: (payoutCounts.FAILED ?? 0) + (payoutCounts.PERMANENT_FAILURE ?? 0),
        },
        activeEscrows: await db.payout.count({
          where: {
            companyId: admin.companyId,
            escrowPda: { not: null },
            status: { in: ["PENDING", "FAILED"] },
          },
        }),
        recentPayouts: recentPayouts.map((payout: any) => ({
          id: payout.id,
          invoiceId: payout.invoiceId,
          contractorName: payout.contractor?.name ?? payout.contractorWallet,
          amountUsdc: Number(payout.amountUsdc ?? 0),
          escrowPda: payout.escrowPda,
          txSignature: payout.txSignature,
          status: payout.status,
          executedAt: payout.executedAt,
          createdAt: payout.createdAt,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load company overview.",
        details: error instanceof Error ? error.message : "Unknown admin overview error.",
      },
      { status: 500 },
    );
  }
}
