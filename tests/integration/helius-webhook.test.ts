import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { POST as heliusWebhookPost } from "../../app/api/webhooks/helius/route";
import { DEVNET_USDC_MINT } from "../../lib/solana/tokens";
import { installPrismaTestDb } from "../helpers/prisma-test-db";

let restoreDb: (() => void) | undefined;
const originalSecret = process.env.HELIUS_WEBHOOK_SECRET;

beforeEach(async () => {
  const installed = await installPrismaTestDb();
  restoreDb = installed.restore;
  await installed.prisma.company.create({
    data: {
      id: "company_treasury_01",
      name: "Treasury Co",
      treasuryWalletAddress: "TreasuryWallet1111111111111111111111111111111",
    },
  });
});

afterEach(() => {
  restoreDb?.();
  restoreDb = undefined;
  process.env.HELIUS_WEBHOOK_SECRET = originalSecret;
});

describe("Helius treasury webhook", () => {
  test("rejects missing webhook secret header", async () => {
    process.env.HELIUS_WEBHOOK_SECRET = "helius_test_secret";
    const response = await heliusWebhookPost(
      new Request("http://localhost:3000/api/webhooks/helius", {
        method: "POST",
        body: JSON.stringify([]),
      }),
    );

    assert.equal(response.status, 400);
  });

  test("accepts finalized USDC transfer payloads and reports processed transactions", async () => {
    process.env.HELIUS_WEBHOOK_SECRET = "helius_test_secret";
    const response = await heliusWebhookPost(
      new Request("http://localhost:3000/api/webhooks/helius", {
        method: "POST",
        headers: { "x-helius-webhook-secret": "helius_test_secret" },
        body: JSON.stringify([
          {
            signature: "5TxHeliusTreasurySignature111111111111111111111111",
            slot: 123,
            tokenTransfers: [
              {
                mint: DEVNET_USDC_MINT.toBase58(),
                fromUserAccount: "SourceWallet11111111111111111111111111111111",
                toUserAccount: "TreasuryWallet1111111111111111111111111111111",
                tokenAmount: 25.5,
              },
            ],
          },
        ]),
      }),
    );

    const json = (await response.json()) as { received: boolean; processedCount: number };

    assert.equal(response.status, 200);
    assert.equal(json.received, true);
    assert.equal(json.processedCount, 1);
  });
});
