import { payouts } from "@/lib/mock-data";

type PayoutListFilters = {
  search?: string;
  from?: Date;
  to?: Date;
  kycStatus?: "Verified" | "Pending" | "Rejected";
};

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseFilters(request: Request): PayoutListFilters & { format: string } {
  const url = new URL(request.url);
  return {
    format: (url.searchParams.get("format") ?? "json").toLowerCase(),
    type: (url.searchParams.get("type") ?? "payouts").toLowerCase(),
    search: url.searchParams.get("search") ?? undefined,
    from: parseDate(url.searchParams.get("from")),
    to: parseDate(url.searchParams.get("to")),
    kycStatus: (url.searchParams.get("kycStatus") as PayoutListFilters["kycStatus"]) ?? undefined,
  } as PayoutListFilters & { format: string; type: string };
}

function buildCsv(rows: typeof payouts) {
  return [
    "id,contractor,amount,currency,date,invoiceId,txHash,kycStatus",
    ...rows.map((row) => [row.id, row.contractor, row.amount.toFixed(2), row.currency, row.date, row.invoiceId, row.txHash, row.kycStatus].join(",")),
  ].join("\n");
}

export async function GET(request: Request) {
  const filters = parseFilters(request);

  if (!request.headers.get("authorization")) {
    const { AuthenticationError } = await import("@/lib/auth/server");
    const { toHttpErrorResponse } = await import("@/lib/auth/http");
    return toHttpErrorResponse(
      new AuthenticationError("Missing Authorization header."),
    );
  }

  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "DATABASE_URL is required to export audit data." },
        { status: 500 },
      );
    }

    const query = filters.search?.trim().toLowerCase();
    const rows = payouts.filter((payout) => {
      if (filters.kycStatus && payout.kycStatus !== filters.kycStatus) return false;
      if (query && !`${payout.contractor} ${payout.invoiceId} ${payout.txHash}`.toLowerCase().includes(query)) return false;
      return true;
    });

    if (filters.format === "csv") {
      const today = new Date().toISOString().slice(0, 10);
      return new Response(buildCsv(rows), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename=\"audit-export-${today}.csv\"`,
        },
      });
    }

    return Response.json(rows);
  }

  try {
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    const { listPayoutsByCompany } = await import("@/lib/db/queries/payouts");
    const { buildGenericCsv, buildPayoutCsv } = await import("@/lib/audit/csv");
    const { logAuditExported } = await import("@/lib/services/audit.service");
    const { prisma } = await import("@/lib/db/prisma");
    const tenant = await requireAdmin(request);
    const db = prisma as any;

    let rows: Array<Record<string, unknown>>;
    let columns: string[];
    const type = (filters as any).type as string;

    if (type === "treasury") {
      const treasuryRows = await db.treasuryTransaction.findMany({
        where: { companyId: tenant.companyId },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      rows = treasuryRows.map((row: any) => ({
        id: row.id,
        signature: row.signature,
        walletAddress: row.walletAddress,
        amountUsdc: Number(row.amountUsdc).toFixed(2),
        direction: row.direction,
        source: row.source,
        destination: row.destination,
        slot: row.slot?.toString?.() ?? "",
        createdAt: row.createdAt.toISOString(),
      }));
      columns = ["id", "signature", "walletAddress", "amountUsdc", "direction", "source", "destination", "slot", "createdAt"];
    } else if (type === "invoices") {
      const invoiceRows = await db.invoice.findMany({
        where: { companyId: tenant.companyId },
        include: { contractor: { select: { name: true, walletAddress: true } }, payouts: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      rows = invoiceRows.map((row: any) => ({
        id: row.id,
        contractorId: row.contractorId,
        contractor: row.contractor?.name,
        amountUsdc: Number(row.amountUsdc).toFixed(2),
        status: row.status,
        submittedAt: row.submittedAt?.toISOString?.() ?? "",
        approvedAt: row.approvedAt?.toISOString?.() ?? "",
        txSignature: row.payouts?.[0]?.txSignature ?? "",
      }));
      columns = ["id", "contractorId", "contractor", "amountUsdc", "status", "submittedAt", "approvedAt", "txSignature"];
    } else if (type === "webhooks") {
      const webhookRows = await db.webhookEvent.findMany({
        where: {},
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      rows = webhookRows.map((row: any) => ({
        id: row.id,
        provider: row.provider,
        externalId: row.externalId,
        eventType: row.eventType,
        processed: row.processed,
        processedAt: row.processedAt?.toISOString?.() ?? "",
        createdAt: row.createdAt.toISOString(),
      }));
      columns = ["id", "provider", "externalId", "eventType", "processed", "processedAt", "createdAt"];
    } else if (type === "reconciliation") {
      const reconciliationRows = await db.reconciliationAudit.findMany({
        where: { companyId: tenant.companyId },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      rows = reconciliationRows.map((row: any) => ({
        id: row.id,
        scope: row.scope,
        entityType: row.entityType,
        entityId: row.entityId,
        severity: row.severity,
        status: row.status,
        expectedValue: row.expectedValue?.toString?.() ?? "",
        actualValue: row.actualValue?.toString?.() ?? "",
        txSignature: row.txSignature,
        createdAt: row.createdAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString?.() ?? "",
      }));
      columns = ["id", "scope", "entityType", "entityId", "severity", "status", "expectedValue", "actualValue", "txSignature", "createdAt", "resolvedAt"];
    } else {
      const payoutRows = await listPayoutsByCompany(tenant.companyId, filters);
      rows = payoutRows as unknown as Array<Record<string, unknown>>;
      columns = ["id", "contractor", "amount", "currency", "date", "invoiceId", "txHash", "kycStatus"];
    }

    await logAuditExported({
      companyId: tenant.companyId,
      actorUserId: tenant.userId,
      metadata: {
        format: filters.format,
        rowCount: rows.length,
        type,
        filters: {
          search: filters.search ?? null,
          from: filters.from?.toISOString() ?? null,
          to: filters.to?.toISOString() ?? null,
          kycStatus: filters.kycStatus ?? null,
        },
      },
    }).catch(() => undefined);

    if (filters.format === "csv") {
      const today = new Date().toISOString().slice(0, 10);
      const csv = type === "payouts"
        ? buildPayoutCsv(rows as any)
        : buildGenericCsv(rows, columns);
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename=\"${type}-audit-export-${today}.csv\"`,
        },
      });
    }

    return Response.json(rows);
  } catch (error) {
    const { toHttpErrorResponse } = await import("@/lib/auth/http");
    return toHttpErrorResponse(error);
  }
}
