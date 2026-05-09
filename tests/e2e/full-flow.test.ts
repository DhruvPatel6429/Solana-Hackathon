import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { installPrismaTestDb } from "../helpers/prisma-test-db";

const CONTRACTOR_WALLET = "11111111111111111111111111111111";

describe("audit export", () => {
  test("exports confirmed payouts as CSV with header and one row per payout", async () => {
    const { prisma, restore } = await installPrismaTestDb();

    const company = await prisma.company.create({
      data: { id: "company_audit_export", name: "Audit Export Co" },
    });
    await prisma.companyUser.create({
      data: {
        id: "membership_audit_export",
        companyId: company.id,
        userId: "test-admin",
      },
    });

    const contractors = await Promise.all(
      ["Maya Chen", "Arjun Mehta", "Lina Reyes"].map((name, index) =>
        prisma.contractor.create({
          data: {
            id: `contractor_audit_${index + 1}`,
            companyId: company.id,
            name,
            walletAddress: CONTRACTOR_WALLET,
            kycStatus: "VERIFIED",
          },
        }),
      ),
    );

    const payoutSeeds = [
      {
        contractor: contractors[0],
        invoiceId: "invoice_audit_001",
        amountUsdc: 100.25,
        txSignature: "fake_audit_tx_001",
        executedAt: new Date("2026-05-03T09:00:00.000Z"),
      },
      {
        contractor: contractors[1],
        invoiceId: "invoice_audit_002",
        amountUsdc: 200.5,
        txSignature: "fake_audit_tx_002",
        executedAt: new Date("2026-05-02T09:00:00.000Z"),
      },
      {
        contractor: contractors[2],
        invoiceId: "invoice_audit_003",
        amountUsdc: 300.75,
        txSignature: "fake_audit_tx_003",
        executedAt: new Date("2026-05-01T09:00:00.000Z"),
      },
    ];

    for (const seed of payoutSeeds) {
      await prisma.invoice.create({
        data: {
          id: seed.invoiceId,
          companyId: company.id,
          contractorId: seed.contractor.id,
          amountUsdc: seed.amountUsdc,
          status: "PAID",
          approvedAt: seed.executedAt,
        },
      });
      await prisma.payout.create({
        data: {
          id: `payout_${seed.invoiceId}`,
          companyId: company.id,
          contractorId: seed.contractor.id,
          invoiceId: seed.invoiceId,
          contractorWallet: CONTRACTOR_WALLET,
          amountUsdc: seed.amountUsdc,
          txSignature: seed.txSignature,
          status: "CONFIRMED",
          executedAt: seed.executedAt,
        },
      });
    }

    const { GET } = await import("../../app/api/audit/export/route");
    const response = await GET(
      new Request("http://localhost:3000/api/audit/export?format=csv", {
        method: "GET",
        headers: { authorization: "Bearer test:test-admin" },
      }),
    );
    const csv = await response.text();
    const lines = csv.trim().split("\n");

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
    assert.equal(lines[0], "id,contractor,amount,currency,date,invoiceId,txHash,kycStatus");
    assert.equal(lines.length, 4);

    for (const seed of payoutSeeds) {
      const row = lines.find((line) => line.includes(seed.txSignature));
      assert.ok(row, `missing CSV row for ${seed.txSignature}`);
      assert.match(row, new RegExp(seed.contractor.name));
      assert.match(row, new RegExp(seed.amountUsdc.toFixed(2)));
      assert.match(row, new RegExp(seed.txSignature));
      assert.match(row, new RegExp(seed.executedAt.toISOString().slice(0, 10)));
    }
    restore();
  });
});
