import "dotenv/config";

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import {
  accountDiscriminator,
  assertCondition,
  buildReport,
  getConnection,
  instructionDiscriminator,
  loadTreasuryWalletFromEnv,
  parsePublicKey,
  printReport,
  requiredEnv,
  runCheck,
  usdcToBaseUnitsString,
  writeJsonArtifact,
} from "./phase4-common";

import {
  depositEscrow,
  deriveEscrowPda,
  getEscrowStatus,
  initializeEscrow,
  invoiceIdToBytes,
  releaseEscrow,
} from "../lib/solana/escrow";

type AnchorIdlInstruction = {
  name: string;
};

type AnchorIdl = {
  metadata?: {
    address?: string;
  };
  instructions?: AnchorIdlInstruction[];
  accounts?: Array<{ name?: string }>;
};

async function loadEscrowIdl(): Promise<AnchorIdl> {
  const candidates = [
    resolve("lib/solana/idl/escrow.json"),
    resolve("target/idl/escrow.json"),
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8");
      return JSON.parse(raw) as AnchorIdl;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `[phase4] Escrow IDL not found. Expected one of: ${candidates.join(", ")}. Run npm run anchor:build and npm run sync-idl.`,
  );
}

function instructionExists(idl: AnchorIdl, names: string[]): boolean {
  const instructionNames = new Set((idl.instructions ?? []).map((item) => item.name));
  return names.some((name) => instructionNames.has(name));
}

async function main(): Promise<void> {
  const checks = [] as Awaited<ReturnType<typeof buildReport>>["checks"];
  const connection = getConnection();
  const treasury = loadTreasuryWalletFromEnv();
  const programId = parsePublicKey(requiredEnv("ESCROW_PROGRAM_ID"), "ESCROW_PROGRAM_ID");
  const contractorWallet = parsePublicKey(requiredEnv("TEST_CONTRACTOR_WALLET"), "TEST_CONTRACTOR_WALLET");
  const amountUsdc = process.env.ANCHOR_VALIDATE_AMOUNT_USDC?.trim() || "0.01";

  let validationInvoiceId = "";
  let escrowPda = "";
  let vaultAddress = "";
  let initializeSignature: string | undefined;
  let depositSignature: string | undefined;
  let releaseSignature: string | undefined;

  await runCheck(checks, "Anchor IDL verification", async () => {
    const idl = await loadEscrowIdl();

    assertCondition(
      instructionExists(idl, ["initializeEscrow", "initialize_escrow"]),
      "IDL missing initialize escrow instruction.",
    );
    assertCondition(
      instructionExists(idl, ["deposit"]),
      "IDL missing deposit instruction.",
    );
    assertCondition(
      instructionExists(idl, ["release"]),
      "IDL missing release instruction.",
    );

    const idlProgramAddress = idl.metadata?.address;
    if (idlProgramAddress) {
      assertCondition(
        idlProgramAddress === programId.toBase58(),
        `IDL metadata address ${idlProgramAddress} does not match ESCROW_PROGRAM_ID ${programId.toBase58()}.`,
      );
    }

    return {
      idlProgramAddress: idlProgramAddress ?? "not_declared",
      requiredInstructions: {
        initializeEscrow: true,
        deposit: true,
        release: true,
      },
      discriminators: {
        initializeEscrow: instructionDiscriminator("initialize_escrow"),
        deposit: instructionDiscriminator("deposit"),
        release: instructionDiscriminator("release"),
        escrowAccount: accountDiscriminator("EscrowAccount"),
      },
    };
  });

  await runCheck(checks, "Deployed program ID validation", async () => {
    const account = await connection.getAccountInfo(programId, "finalized");
    assertCondition(account, `Program account ${programId.toBase58()} not found.`);
    assertCondition(account.executable, `Program ${programId.toBase58()} is not executable.`);

    return {
      programId: programId.toBase58(),
      owner: account.owner.toBase58(),
      executable: account.executable,
      dataLength: account.data.length,
    };
  });

  await runCheck(checks, "PDA derivation consistency", async () => {
    validationInvoiceId = randomBytes(32).toString("hex");
    const invoiceBytes = invoiceIdToBytes(validationInvoiceId);
    const fromHelper = deriveEscrowPda(validationInvoiceId);
    const fromNative = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), treasury.publicKey.toBuffer(), Buffer.from(invoiceBytes)],
      programId,
    );

    assertCondition(
      fromHelper.escrowPda.equals(fromNative[0]),
      "Escrow PDA mismatch between helper and native derivation.",
    );
    assertCondition(fromHelper.bump === fromNative[1], "Escrow PDA bump mismatch.");

    return {
      invoiceId: validationInvoiceId,
      escrowPda: fromHelper.escrowPda.toBase58(),
      bump: fromHelper.bump,
    };
  });

  await runCheck(checks, "Escrow initialize/deposit/release live validation", async () => {
    const initialized = await initializeEscrow({ invoiceId: validationInvoiceId });
    initializeSignature = initialized.signature;
    escrowPda = initialized.escrowPda;
    vaultAddress = initialized.vault;

    const deposited = await depositEscrow({
      invoiceId: validationInvoiceId,
      amount: amountUsdc,
    });
    depositSignature = deposited.signature;

    const released = await releaseEscrow({
      invoiceId: validationInvoiceId,
      contractorWallet: contractorWallet.toBase58(),
    });
    releaseSignature = released.signature;

    const status = await getEscrowStatus(validationInvoiceId);
    assertCondition(status.exists, "Escrow account should exist after lifecycle execution.");
    assertCondition(status.isReleased === true, "Escrow should be released after release instruction.");
    assertCondition(status.amount === "0", `Escrow amount should be zero after release, received ${status.amount}.`);

    return {
      invoiceId: validationInvoiceId,
      escrowPda: released.escrowPda,
      initializeSignature: initializeSignature ?? "already_initialized",
      depositSignature: depositSignature ?? "already_funded",
      releaseSignature,
      amountBaseUnits: usdcToBaseUnitsString(amountUsdc),
    };
  });

  await runCheck(checks, "Escrow account deserialization", async () => {
    assertCondition(Boolean(escrowPda), "Escrow PDA not available for deserialization check.");

    const escrowAccount = await connection.getAccountInfo(new PublicKey(escrowPda), "finalized");
    assertCondition(escrowAccount, `Escrow account ${escrowPda} not found.`);

    const discriminator = escrowAccount.data.subarray(0, 8).toString("hex");
    const expectedDiscriminator = accountDiscriminator("EscrowAccount");
    assertCondition(
      discriminator === expectedDiscriminator,
      `Escrow discriminator mismatch. Expected ${expectedDiscriminator}, received ${discriminator}.`,
    );

    return {
      escrowPda,
      discriminator,
      dataLength: escrowAccount.data.length,
    };
  });

  await runCheck(checks, "SPL token vault ownership validation", async () => {
    assertCondition(Boolean(vaultAddress), "Vault address not available for ownership validation.");

    const vault = await connection.getParsedAccountInfo(new PublicKey(vaultAddress), "finalized");
    assertCondition(vault.value, `Vault account ${vaultAddress} not found.`);
    assertCondition(vault.value.owner.equals(TOKEN_PROGRAM_ID), "Vault account owner must be SPL Token program.");

    const parsed = "parsed" in (vault.value.data as object) ? (vault.value.data as any).parsed : null;
    const vaultAuthority = parsed?.info?.owner as string | undefined;

    assertCondition(Boolean(vaultAuthority), "Vault parsed owner is missing.");
    assertCondition(
      vaultAuthority === escrowPda,
      `Vault authority mismatch. Expected escrow PDA ${escrowPda}, got ${vaultAuthority}.`,
    );

    return {
      vault: vaultAddress,
      ownerProgram: TOKEN_PROGRAM_ID.toBase58(),
      vaultAuthority,
    };
  });

  const report = buildReport("validate-anchor-deployment", checks);
  const artifact = {
    ...report,
    lifecycle: {
      invoiceId: validationInvoiceId,
      escrowPda,
      vault: vaultAddress,
      initializeSignature: initializeSignature ?? null,
      depositSignature: depositSignature ?? null,
      releaseSignature: releaseSignature ?? null,
    },
  };

  await writeJsonArtifact("artifacts/anchor-deployment-validation.json", artifact);
  printReport(report);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase4] validate-anchor-deployment failed: ${message}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
