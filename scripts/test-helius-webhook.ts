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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const checks = [] as Awaited<ReturnType<typeof buildReport>>["checks"];

  const heliusSecret = requiredEnv("HELIUS_WEBHOOK_SECRET");
  const connection = getConnection();
  const mint = getUsdcMint();
  const treasury = loadTreasuryWalletFromEnv();
  const heliusUrl = webhookUrlsFromEnv().helius;

  const contractor = parsePublicKey(requiredEnv("TEST_CONTRACTOR_WALLET"), "TEST_CONTRACTOR_WALLET");
  const monitoredWallets = [treasury.publicKey.toBase58(), contractor.toBase58()];
  const transferAmount = Number(process.env.HELIUS_VALIDATION_TRANSFER_USDC ?? "0.01");
  assertCondition(transferAmount > 0, "HELIUS_VALIDATION_TRANSFER_USDC must be positive.");

  const runId = `helius_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const companyId = `company_${runId}`;

  let transferSignature = "";
  let firstWebhookStatus = 0;
  let replayStatus = 0;
  let nonceReplayStatus = 0;
  let seededCompanyInitialTreasuryBalanceUpdatedAt: Date | null = null;
  let baselineTimestampByCompanyIdBeforeWebhook = new Map<string, number>();

  await runCheck(checks, "Seed company for treasury webhook persistence", async () => {
    const company = await db.company.create({
      data: {
        id: companyId,
        name: `Phase4 Helius Company ${runId}`,
        treasuryWalletAddress: treasury.publicKey.toBase58(),
      },
    });
    seededCompanyInitialTreasuryBalanceUpdatedAt = company.treasuryBalanceUpdatedAt
      ? new Date(company.treasuryBalanceUpdatedAt)
      : null;

    return {
      companyId,
      treasuryWallet: treasury.publicKey.toBase58(),
      seededCompanyInitialTreasuryBalanceUpdatedAt,
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

  await runCheck(checks, "Capture pre-webhook treasury timestamp baseline", async () => {
    const baselineCompanies = (await db.company.findMany({
      where: {
        treasuryWalletAddress: {
          in: monitoredWallets,
        },
      },
      select: {
        id: true,
        treasuryBalanceUpdatedAt: true,
      },
    })) as Array<{ id: string; treasuryBalanceUpdatedAt: Date | null }>;

    baselineTimestampByCompanyIdBeforeWebhook = new Map<string, number>(
      baselineCompanies.map((item) => [
        item.id,
        item.treasuryBalanceUpdatedAt ? new Date(item.treasuryBalanceUpdatedAt).getTime() : 0,
      ]),
    );

    console.info("[phase4] Captured pre-webhook treasury timestamp baseline", {
      monitoredWallets,
      baselineByCompanyId: Object.fromEntries(
        Array.from(baselineTimestampByCompanyIdBeforeWebhook.entries()).map(([id, ms]) => [
          id,
          ms ? new Date(ms).toISOString() : null,
        ]),
      ),
    });

    return {
      monitoredWallets,
      baselineCompanyCount: baselineTimestampByCompanyIdBeforeWebhook.size,
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
    const pollTimeoutMs = 30_000;
    const pollIntervalMs = 1_000;
    const pollStartMs = Date.now();

    let txRecord: any = null;
    let company: any = null;
    let baselineFound = false;
    let baselineTimestampMs = 0;
    let latestTimestampMs: number | null = null;
    let attempt = 0;

    console.info("[phase4] Treasury timestamp poll started", {
      transferSignature,
      pollTimeoutMs,
      pollIntervalMs,
      monitoredWallets,
      seededCompanyId: companyId,
      seededCompanyInitialTreasuryBalanceUpdatedAt:
        seededCompanyInitialTreasuryBalanceUpdatedAt?.toISOString() ?? null,
      baselineByCompanyId: Object.fromEntries(
        Array.from(baselineTimestampByCompanyIdBeforeWebhook.entries()).map(([id, ms]) => [id, ms ? new Date(ms).toISOString() : null]),
      ),
    });

    while (Date.now() - pollStartMs <= pollTimeoutMs) {
      attempt += 1;

      txRecord = await db.treasuryTransaction.findUnique({
        where: { signature: transferSignature },
      });

      company = txRecord?.companyId
        ? await db.company.findUnique({ where: { id: txRecord.companyId } })
        : null;

      baselineFound = txRecord?.companyId
        ? baselineTimestampByCompanyIdBeforeWebhook.has(txRecord.companyId)
        : false;
      baselineTimestampMs = txRecord?.companyId
        ? (baselineTimestampByCompanyIdBeforeWebhook.get(txRecord.companyId) ?? 0)
        : 0;

      latestTimestampMs = company?.treasuryBalanceUpdatedAt
        ? new Date(company.treasuryBalanceUpdatedAt).getTime()
        : null;
      const timestampAdvanced = latestTimestampMs !== null && latestTimestampMs > baselineTimestampMs;
      const elapsedMs = Date.now() - pollStartMs;

      console.info("[phase4] Treasury timestamp poll tick", {
        attempt,
        elapsedMs,
        txFound: Boolean(txRecord),
        txCompanyId: txRecord?.companyId ?? null,
        companyFound: Boolean(company),
        baselineFound,
        baselineTimestamp: baselineTimestampMs ? new Date(baselineTimestampMs).toISOString() : null,
        polledTimestamp: latestTimestampMs ? new Date(latestTimestampMs).toISOString() : null,
        timestampDeltaMs:
          latestTimestampMs !== null ? latestTimestampMs - baselineTimestampMs : null,
        timestampAdvanced,
      });

      if (txRecord && company && timestampAdvanced) {
        break;
      }

      await sleep(pollIntervalMs);
    }

    assertCondition(Boolean(txRecord), `TreasuryTransaction missing for ${transferSignature}.`);
    assertCondition(
      Boolean(txRecord?.companyId),
      `TreasuryTransaction ${transferSignature} is missing companyId linkage.`,
    );
    assertCondition(
      Boolean(company),
      `Company ${txRecord?.companyId ?? "unknown"} missing for treasury transaction ${transferSignature}.`,
    );
    assertCondition(
      baselineFound,
      `Missing baseline timestamp snapshot for company ${txRecord.companyId}.`,
    );
    assertCondition(
      latestTimestampMs !== null,
      `Treasury balance timestamp was not updated for company ${txRecord.companyId}.`,
    );
    assertCondition(
      latestTimestampMs > baselineTimestampMs,
      `Treasury balance timestamp was not updated. companyId=${txRecord.companyId} baseline=${baselineTimestampMs ? new Date(baselineTimestampMs).toISOString() : "null"} latest=${company.treasuryBalanceUpdatedAt?.toISOString?.() ?? String(company.treasuryBalanceUpdatedAt)}.`,
    );

    console.info("[phase4] Treasury timestamp poll completed", {
      elapsedMs: Date.now() - pollStartMs,
      txCompanyId: txRecord.companyId,
      baselineTimestamp: baselineTimestampMs ? new Date(baselineTimestampMs).toISOString() : null,
      finalTimestamp: latestTimestampMs ? new Date(latestTimestampMs).toISOString() : null,
      finalTimestampDeltaMs:
        latestTimestampMs !== null ? latestTimestampMs - baselineTimestampMs : null,
    });

    const liveTreasury = await getUsdcBalance(connection, treasury.publicKey, mint);

    return {
      treasuryTransactionId: txRecord.id,
      companyId: txRecord.companyId,
      direction: txRecord.direction,
      amountUsdc: txRecord.amountUsdc?.toString?.() ?? txRecord.amountUsdc,
      companyBalanceUsdc: company.treasuryBalanceUsdc?.toString?.() ?? company.treasuryBalanceUsdc,
      treasuryBalanceUpdatedAt: company.treasuryBalanceUpdatedAt,
      treasuryBalanceBaseline: baselineTimestampMs
        ? new Date(baselineTimestampMs).toISOString()
        : null,
      treasuryBalanceTimestampDeltaMs:
        latestTimestampMs !== null ? latestTimestampMs - baselineTimestampMs : null,
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
