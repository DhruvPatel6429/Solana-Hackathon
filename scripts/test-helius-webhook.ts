import "dotenv/config";

import {
  assertCondition,
  buildReport,
  explorerTxUrl,
  fetchJsonWithTimeout,
  getConnection,
  getUsdcBalance,
  getUsdcMint,
  loadTreasuryWalletFromEnv,
  parsePublicKey,
  printReport,
  requiredEnv,
  runCheck,
  webhookUrlsFromEnv,
  writeJsonArtifact,
} from "./phase4-common";

import { transferUSDC } from "../lib/solana/transfer";
import { prisma } from "../lib/db/prisma";

const db = prisma as any;

async function main(): Promise<void> {
  const checks = [] as Awaited<ReturnType<typeof buildReport>>["checks"];

  const heliusSecret = requiredEnv("HELIUS_WEBHOOK_SECRET");
  const connection = getConnection();
  const mint = getUsdcMint();
  const treasury = loadTreasuryWalletFromEnv();
  const heliusUrl = webhookUrlsFromEnv().helius;

  const contractor = parsePublicKey(requiredEnv("TEST_CONTRACTOR_WALLET"), "TEST_CONTRACTOR_WALLET");
  const transferAmount = Number(process.env.HELIUS_VALIDATION_TRANSFER_USDC ?? "0.01");
  assertCondition(transferAmount > 0, "HELIUS_VALIDATION_TRANSFER_USDC must be positive.");

  const runId = `helius_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const companyId = `company_${runId}`;

  let transferSignature = "";
  let firstWebhookStatus = 0;
  let replayStatus = 0;
  let nonceReplayStatus = 0;

  await runCheck(checks, "Seed company for treasury webhook persistence", async () => {
    await db.company.create({
      data: {
        id: companyId,
        name: `Phase4 Helius Company ${runId}`,
        treasuryWalletAddress: treasury.publicKey.toBase58(),
      },
    });

    return {
      companyId,
      treasuryWallet: treasury.publicKey.toBase58(),
    };
  });

  await runCheck(checks, "Trigger treasury transfer on devnet", async () => {
    transferSignature = await transferUSDC({
      fromWallet: treasury,
      toWallet: contractor.toBase58(),
      amount: transferAmount,
    });

    return {
      transferSignature,
      explorerUrl: explorerTxUrl(transferSignature),
      transferAmount,
    };
  });

  await runCheck(checks, "Deliver Helius webhook payload", async () => {
    const payload = [
      {
        signature: transferSignature,
        slot: 1,
        source: "PHASE4_VALIDATION",
        type: "TOKEN_TRANSFER",
        tokenTransfers: [
          {
            mint: mint.toBase58(),
            fromUserAccount: treasury.publicKey.toBase58(),
            toUserAccount: contractor.toBase58(),
            tokenAmount: transferAmount,
          },
        ],
      },
    ];

    const result = await fetchJsonWithTimeout(
      heliusUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-helius-webhook-secret": heliusSecret,
          "x-webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
          "x-webhook-nonce": `helius-${runId}-1`,
        },
        body: JSON.stringify(payload),
      },
      20_000,
    );

    firstWebhookStatus = result.status;

    assertCondition(
      result.status >= 200 && result.status < 300,
      `Helius webhook delivery failed: ${result.status} ${result.text}`,
    );

    return {
      endpoint: heliusUrl,
      status: result.status,
      body: result.json ?? result.text,
    };
  });

  await runCheck(checks, "Verify treasury persistence + balance update", async () => {
    const [txRecord, company] = await Promise.all([
      db.treasuryTransaction.findUnique({
        where: { signature: transferSignature },
      }),
      db.company.findUnique({ where: { id: companyId } }),
    ]);

    assertCondition(Boolean(txRecord), `TreasuryTransaction missing for ${transferSignature}.`);
    assertCondition(Boolean(company), `Company ${companyId} missing.`);
    assertCondition(Boolean(company.treasuryBalanceUpdatedAt), "Treasury balance timestamp was not updated.");

    const liveTreasury = await getUsdcBalance(connection, treasury.publicKey, mint);

    return {
      treasuryTransactionId: txRecord.id,
      direction: txRecord.direction,
      amountUsdc: txRecord.amountUsdc?.toString?.() ?? txRecord.amountUsdc,
      companyBalanceUsdc: company.treasuryBalanceUsdc?.toString?.() ?? company.treasuryBalanceUsdc,
      treasuryBalanceUpdatedAt: company.treasuryBalanceUpdatedAt,
      liveTreasury,
    };
  });

  await runCheck(checks, "Verify webhook replay protections", async () => {
    const payload = [
      {
        signature: transferSignature,
        slot: 1,
        source: "PHASE4_VALIDATION",
        type: "TOKEN_TRANSFER",
        tokenTransfers: [
          {
            mint: mint.toBase58(),
            fromUserAccount: treasury.publicKey.toBase58(),
            toUserAccount: contractor.toBase58(),
            tokenAmount: transferAmount,
          },
        ],
      },
    ];

    const replay = await fetchJsonWithTimeout(
      heliusUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-helius-webhook-secret": heliusSecret,
          "x-webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
          "x-webhook-nonce": `helius-${runId}-2`,
        },
        body: JSON.stringify(payload),
      },
      20_000,
    );

    replayStatus = replay.status;

    assertCondition(replay.status >= 200 && replay.status < 300, `Replay webhook should still be accepted idempotently, got ${replay.status}.`);

    const nonce = `helius-${runId}-fixed`;
    const firstNonce = await fetchJsonWithTimeout(
      heliusUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-helius-webhook-secret": heliusSecret,
          "x-webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
          "x-webhook-nonce": nonce,
        },
        body: JSON.stringify(payload),
      },
      20_000,
    );
    assertCondition(firstNonce.status >= 200 && firstNonce.status < 300, "First fixed nonce request should pass.");

    const secondNonce = await fetchJsonWithTimeout(
      heliusUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-helius-webhook-secret": heliusSecret,
          "x-webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
          "x-webhook-nonce": nonce,
        },
        body: JSON.stringify(payload),
      },
      20_000,
    );

    nonceReplayStatus = secondNonce.status;

    assertCondition(
      secondNonce.status >= 400,
      `Nonce replay should be rejected with >=400 status, got ${secondNonce.status}`,
    );

    const count = await db.treasuryTransaction.count({ where: { signature: transferSignature } });
    assertCondition(count === 1, `Treasury transaction duplicate detected for ${transferSignature}: ${count}`);

    return {
      replayStatus,
      nonceReplayStatus,
      treasuryTransactionCount: count,
    };
  });

  const report = buildReport("test-helius-webhook", checks);

  await writeJsonArtifact("artifacts/helius-validation-report.json", {
    ...report,
    runId,
    companyId,
    heliusUrl,
    transferSignature,
    explorerUrl: transferSignature ? explorerTxUrl(transferSignature) : null,
    statuses: {
      firstWebhookStatus,
      replayStatus,
      nonceReplayStatus,
    },
  });

  printReport(report);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase4] test-helius-webhook failed: ${message}`);
  process.exitCode = 1;
});
