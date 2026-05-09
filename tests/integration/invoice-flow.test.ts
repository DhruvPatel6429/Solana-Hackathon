import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { installPrismaTestDb } from "../helpers/prisma-test-db";

const FAKE_TX_SIGNATURE = "fake_devnet_tx_invoice_lifecycle_001";
const CONTRACTOR_WALLET = "11111111111111111111111111111111";

afterEach(() => {
  delete process.env.MOCK_SOLANA_TX_SIGNATURE;
});

describe("invoice lifecycle", () => {
  test("approving a pending invoice pays it and stores the payout tx signature", async () => {
    process.env.MOCK_SOLANA_TX_SIGNATURE = FAKE_TX_SIGNATURE;
    const { prisma, restore } = await installPrismaTestDb();

    const company = await prisma.company.create({
      data: { id: "company_invoice_flow", name: "Invoice Flow Co" },
    });
    const contractor = await prisma.contractor.create({
      data: {
        id: "contractor_invoice_flow",
        companyId: company.id,
        name: "Maya Chen",
        walletAddress: CONTRACTOR_WALLET,
        kycStatus: "VERIFIED",
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        id: "invoice_lifecycle_001",
        companyId: company.id,
        contractorId: contractor.id,
        amountUsdc: 125.5,
        status: "PENDING",
      },
    });

    const { PATCH } = await import("../../app/api/invoices/approve/route");
    const response = await PATCH(
      new Request("http://localhost:3000/api/invoices/approve", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.txHash, FAKE_TX_SIGNATURE);

    const paidInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.id },
    });
    assert.equal(paidInvoice.status, "PAID");

    const payout = await prisma.payout.findUnique({
      where: { invoiceId: invoice.id },
    });
    assert.ok(payout);
    assert.equal(payout.txSignature, FAKE_TX_SIGNATURE);
    assert.equal(Number(payout.amountUsdc), 125.5);
    assert.equal(payout.contractorWallet, CONTRACTOR_WALLET);
    assert.equal(payout.status, "CONFIRMED");
    restore();
  });
});
