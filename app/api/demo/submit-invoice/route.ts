import { NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

function isJudgeModeEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_JUDGE_MODE === "true" ||
    process.env.JUDGE_MODE === "true"
  );
}

function getClaimedRole(claims: Record<string, unknown>): string | undefined {
  const appMetadata = claims.app_metadata;
  const userMetadata = claims.user_metadata;

  if (
    typeof appMetadata === "object" &&
    appMetadata !== null &&
    "role" in appMetadata
  ) {
    return String(appMetadata.role);
  }

  if (
    typeof userMetadata === "object" &&
    userMetadata !== null &&
    "role" in userMetadata
  ) {
    return String(userMetadata.role);
  }

  return undefined;
}

export async function POST(request: Request): Promise<Response> {
  if (!isJudgeModeEnabled()) {
    return NextResponse.json(
      { success: false, error: "Judge mode is disabled." },
      { status: 403 },
    );
  }

  let tenant: Awaited<ReturnType<typeof requireTenantContext>>;
  try {
    tenant = await requireTenantContext(request);
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  const role = getClaimedRole(tenant.claims);
  if (role && role !== "admin") {
    return NextResponse.json(
      { success: false, error: "Only admins can submit demo invoices." },
      { status: 403 },
    );
  }

  const invoice = await db.invoice.findFirst({
    where: {
      companyId: tenant.companyId,
      status: "PENDING",
    },
    orderBy: { submittedAt: "asc" },
    select: { id: true, status: true, submittedAt: true },
  });

  if (!invoice) {
    return NextResponse.json(
      { success: false, error: "No pending invoice found." },
      { status: 404 },
    );
  }

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: { submittedAt: new Date() },
    select: { id: true, status: true, submittedAt: true },
  });

  return NextResponse.json({
    success: true,
    invoice: updated,
    note: "Invoice remains PENDING and is now marked as submitted.",
  });
}
