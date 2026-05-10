import "dotenv/config";

import { PublicKey } from "@solana/web3.js";
import {
  assertCondition,
  buildReport,
  fetchJsonWithTimeout,
  getConnection,
  getUsdcBalance,
  getUsdcMint,
  loadTreasuryWalletFromEnv,
  optionalEnv,
  parsePublicKey,
  printReport,
  requiredEnv,
  runCheck,
  verifyDatabaseConnectivity,
  webhookUrlsFromEnv,
  writeJsonArtifact,
} from "./phase4-common";

const REQUIRED_ENV_VARS = [
  "SOLANA_RPC_URL",
  "TREASURY_WALLET_SECRET_KEY",
  "ESCROW_PROGRAM_ID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DODO_WEBHOOK_SECRET",
  "HELIUS_WEBHOOK_SECRET",
  "NEXT_PUBLIC_SOLANA_NETWORK",
  "TEST_CONTRACTOR_WALLET",
  "TEST_COMPANY_WALLET",
  "DEVNET_USDC_MINT",
] as const;

async function main(): Promise<void> {
  const checks = [] as Awaited<ReturnType<typeof buildReport>>["checks"];

  await runCheck(checks, "Environment variable completeness", async () => {
    for (const envName of REQUIRED_ENV_VARS) {
      requiredEnv(envName);
    }

    return {
      requiredEnvVars: REQUIRED_ENV_VARS.length,
    };
  });

  const connection = getConnection();
  const mint = getUsdcMint();

  await runCheck(checks, "Treasury wallet verification", async () => {
    const wallet = loadTreasuryWalletFromEnv();
    const treasuryAddress = wallet.publicKey.toBase58();
    const configuredCompanyWallet = requiredEnv("TEST_COMPANY_WALLET");

    const lamports = await connection.getBalance(wallet.publicKey, "finalized");
    assertCondition(lamports >= 0, "Treasury SOL balance query failed.");

    if (configuredCompanyWallet) {
      parsePublicKey(configuredCompanyWallet, "TEST_COMPANY_WALLET");
    }

    return {
      treasuryWallet: treasuryAddress,
      companyWallet: configuredCompanyWallet,
      lamports,
    };
  });

  await runCheck(checks, "Escrow program deployment verification", async () => {
    const programId = parsePublicKey(requiredEnv("ESCROW_PROGRAM_ID"), "ESCROW_PROGRAM_ID");
    const account = await connection.getAccountInfo(programId, "finalized");

    assertCondition(account, `Escrow program account ${programId.toBase58()} was not found on devnet.`);
    assertCondition(account.executable, `Escrow program ${programId.toBase58()} is not executable.`);

    return {
      programId: programId.toBase58(),
      executable: account.executable,
      owner: account.owner.toBase58(),
      dataLength: account.data.length,
    };
  });

  await runCheck(checks, "Treasury USDC balance verification", async () => {
    const wallet = loadTreasuryWalletFromEnv();
    const balance = await getUsdcBalance(connection, wallet.publicKey, mint);

    assertCondition(
      Number(balance.amount) > 0,
      `Treasury USDC balance is zero for ATA ${balance.tokenAccount}. Fund treasury wallet before live validation.`,
    );

    return {
      wallet: wallet.publicKey.toBase58(),
      mint: mint.toBase58(),
      tokenAccount: balance.tokenAccount,
      amount: balance.amount,
      uiAmount: balance.uiAmount,
    };
  });

  await runCheck(checks, "Contractor wallet validity", async () => {
    const contractorWallet = parsePublicKey(requiredEnv("TEST_CONTRACTOR_WALLET"), "TEST_CONTRACTOR_WALLET");
    const companyWallet = parsePublicKey(requiredEnv("TEST_COMPANY_WALLET"), "TEST_COMPANY_WALLET");

    assertCondition(
      !contractorWallet.equals(companyWallet),
      "TEST_CONTRACTOR_WALLET must be different from TEST_COMPANY_WALLET.",
    );

    return {
      contractorWallet: contractorWallet.toBase58(),
      companyWallet: companyWallet.toBase58(),
    };
  });

  await runCheck(checks, "Database connectivity", async () => {
    await verifyDatabaseConnectivity();

    return {
      databaseHost: requiredEnv("DATABASE_URL").split("@").at(-1)?.split("/")[0] ?? "unknown",
    };
  });

  await runCheck(checks, "Webhook endpoint reachability", async () => {
    const urls = webhookUrlsFromEnv();

    const [dodo, helius] = await Promise.all([
      fetchJsonWithTimeout(urls.dodo, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
          "x-webhook-nonce": `setup-${Date.now()}-dodo`,
        },
        body: JSON.stringify({ ping: true }),
      }),
      fetchJsonWithTimeout(urls.helius, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-helius-webhook-secret": optionalEnv("HELIUS_WEBHOOK_SECRET") ?? "invalid",
          "x-webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
          "x-webhook-nonce": `setup-${Date.now()}-helius`,
        },
        body: JSON.stringify([{ ping: true }]),
      }),
    ]);

    assertCondition(
      dodo.status >= 200 && dodo.status < 500,
      `Dodo webhook endpoint returned non-reachable status ${dodo.status}`,
    );
    assertCondition(
      helius.status >= 200 && helius.status < 500,
      `Helius webhook endpoint returned non-reachable status ${helius.status}`,
    );

    return {
      dodo: {
        url: urls.dodo,
        status: dodo.status,
      },
      helius: {
        url: urls.helius,
        status: helius.status,
      },
    };
  });

  const report = buildReport("setup-devnet", checks);
  await writeJsonArtifact("artifacts/setup-devnet-report.json", report);
  printReport(report);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase4] setup-devnet failed: ${message}`);
  process.exitCode = 1;
});
