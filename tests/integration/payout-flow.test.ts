import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { installPrismaTestDb } from "../helpers/prisma-test-db";

const EXISTING_TX_SIGNATURE = "fake_devnet_tx_already_paid_001";
const CONTRACTOR_WALLET = "11111111111111111111111111111111";

describe("duplicate payout prevention", () => {
  test("approving an already-paid invoice returns an error and creates no second payout", async () => {
    const { prisma, restore } = await installPrismaTestDb();

    const company = await prisma.company.create({
      data: { id: "company_duplicate_flow", name: "Duplicate Flow Co" },
    });
    await prisma.companyUser.create({
      data: {
        id: "membership_duplicate_flow",
        companyId: company.id,
        userId: "test-admin",
      },
    });
    const contractor = await prisma.contractor.create({
      data: {
        id: "contractor_duplicate_flow",
        companyId: company.id,
        name: "Arjun Mehta",
        walletAddress: CONTRACTOR_WALLET,
        kycStatus: "VERIFIED",
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        id: "invoice_duplicate_001",
        companyId: company.id,
        contractorId: contractor.id,
        amountUsdc: 250,
        status: "PAID",
        approvedAt: new Date("2026-05-01T10:00:00.000Z"),
      },
    });
    await prisma.payout.create({
      data: {
        id: "payout_duplicate_existing",
        companyId: company.id,
        contractorId: contractor.id,
        invoiceId: invoice.id,
        contractorWallet: CONTRACTOR_WALLET,
        amountUsdc: 250,
        txSignature: EXISTING_TX_SIGNATURE,
        status: "CONFIRMED",
        executedAt: new Date("2026-05-01T10:01:00.000Z"),
      },
    });

    const { PATCH } = await import("../../app/api/invoices/approve/route");
    const response = await PATCH(
      new Request("http://localhost:3000/api/invoices/approve", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test:test-admin",
        },
        body: JSON.stringify({ invoiceId: invoice.id }),
      }),
    );
    const body = await response.json();

    assert.equal([400, 409].includes(response.status), true);
    assert.equal(body.success, false);

    const payoutCount = await prisma.payout.count({
      where: { invoiceId: invoice.id },
    });
    assert.equal(payoutCount, 1);

    const existingPayout = await prisma.payout.findUnique({
      where: { invoiceId: invoice.id },
    });
    assert.equal(existingPayout.txSignature, EXISTING_TX_SIGNATURE);
    restore();
  });
});
