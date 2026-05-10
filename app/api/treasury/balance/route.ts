import { NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { getTreasuryBalance } from "@/lib/services/treasury.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const db = prisma as any;

export async function GET(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdmin>>;

  try {
    admin = await requireAdmin(request);
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  const company = await db.company.findUnique({
    where: { id: admin.companyId },
    select: {
      id: true,
      treasuryWalletAddress: true,
      treasuryBalanceUsdc: true,
      treasuryBalanceUpdatedAt: true,
    },
  });

  if (!company?.treasuryWalletAddress) {
    return NextResponse.json(
      {
        balance: 0,
        source: "error",
        error: "Treasury wallet address is not configured for this company.",
      },
      { status: 400 },
    );
  }

  try {
    const balance = await getTreasuryBalance(company.treasuryWalletAddress);
    await db.company.update({
      where: { id: company.id },
      data: {
        treasuryBalanceUsdc: balance.toString(),
        treasuryBalanceUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({
      balance,
      wallet: company.treasuryWalletAddress,
      source: "solana",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown treasury sync error.";
    console.error("[treasury:balance] Live balance fetch failed", {
      companyId: company.id,
      wallet: company.treasuryWalletAddress,
      error: message,
    });

    return NextResponse.json(
      {
        balance: Number(company.treasuryBalanceUsdc),
        wallet: company.treasuryWalletAddress,
        source: "cache",
        updatedAt: company.treasuryBalanceUpdatedAt,
        error: message,
      },
      { status: 502 },
    );
  }
}
