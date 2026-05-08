import assert from "node:assert/strict";
import test from "node:test";

import { buildPayoutCsv } from "@/lib/audit/csv";

test("buildPayoutCsv produces header and escaped values", () => {
  const csv = buildPayoutCsv([
    {
      id: "pay_1",
      contractor: "Jane, Inc.",
      amount: 1250.5,
      currency: "USDC",
      date: "2026-05-07",
      invoiceId: "INV-10",
      txHash: "abc\"123",
      kycStatus: "Verified",
    },
  ]);

  const lines = csv.split("\n");
  assert.equal(
    lines[0],
    "id,contractor,amount,currency,date,invoiceId,txHash,kycStatus",
  );
  assert.match(lines[1], /^pay_1,"Jane, Inc\.",1250\.50,USDC,2026-05-07,INV-10,"abc""123",Verified$/);
});
