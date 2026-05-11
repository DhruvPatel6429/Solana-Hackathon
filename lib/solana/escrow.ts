import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import bs58 from "bs58";
import {
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { connection } from "./connection";
import escrowIdl from "./idl/escrow.json";
import { DEVNET_USDC_MINT, getUSDCAccount, USDC_DECIMALS } from "./tokens";

const DEFAULT_ESCROW_PROGRAM_ID = "9MtY5vEpJCf31Ak19wfJ25Ef5bdVvs9nzoxeh3yEf4FB";

export const ESCROW_PROGRAM_ID = new PublicKey(
  process.env.ESCROW_PROGRAM_ID ?? DEFAULT_ESCROW_PROGRAM_ID,
);

const ESCROW_IDL = normalizeIdl(escrowIdl as unknown as Idl);

function normalizeIdl(idl: Idl): Idl {
  const normalized = structuredClone(idl) as any;

  normalized.address = ESCROW_PROGRAM_ID.toBase58();
  if (normalized.metadata) {
    normalized.metadata.address = ESCROW_PROGRAM_ID.toBase58();
  }

  normalized.instructions = normalized.instructions?.map((instruction: any) => ({
    ...instruction,
    discriminator: Buffer.from(instruction.discriminator),
  }));
  normalized.accounts = normalized.accounts?.map((account: any) => ({
    ...account,
    discriminator: Buffer.from(account.discriminator),
  }));
  normalized.events = normalized.events?.map((event: any) => ({
    ...event,
    discriminator: Buffer.from(event.discriminator),
  }));

  return normalized as Idl;
}

type EscrowAccountData = {
  authority: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  amount: InstanceType<typeof BN>;
  isReleased: boolean;
  bump: number;
  invoiceId: number[] | Uint8Array;
};

export type ReleaseEscrowParams = {
  invoiceId: string;
  contractorWallet: string;
};

export type InitializeEscrowParams = {
  invoiceId: string;
};

export type InitializeEscrowResult = {
  signature?: string;
  escrowPda: string;
  vault: string;
  alreadyInitialized: boolean;
};

export type DepositEscrowParams = {
  invoiceId: string;
  amount: number | string;
};

export type DepositEscrowResult = {
  signature?: string;
  escrowPda: string;
  vault: string;
  amountBaseUnits: string;
  alreadyFunded: boolean;
};

export type ReleaseEscrowResult = {
  signature: string;
  escrowPda: string;
};

export type EscrowStatus = {
  exists: boolean;
  escrowPda: string;
  vault: string;
  mint?: string;
  amount?: string;
  isReleased?: boolean;
};

export class EscrowReleaseError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "EscrowReleaseError";
    this.cause = cause;
  }
}

export class EscrowNotFoundError extends EscrowReleaseError {
  constructor(invoiceId: string, escrowPda: PublicKey) {
    super(
      `[solana:escrow] Escrow not found for invoice ${invoiceId} at ${escrowPda.toBase58()}.`,
    );
    this.name = "EscrowNotFoundError";
  }
}

export class EscrowAlreadyReleasedError extends EscrowReleaseError {
  constructor(invoiceId: string) {
    super(`[solana:escrow] Escrow for invoice ${invoiceId} is already released.`);
    this.name = "EscrowAlreadyReleasedError";
  }
}

export class EscrowDepositError extends EscrowReleaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "EscrowDepositError";
  }
}

let cachedTreasuryWallet: Keypair | null = null;

function getTreasuryWallet(): Keypair {
  if (cachedTreasuryWallet) {
    return cachedTreasuryWallet;
  }

  const secretKey = process.env.TREASURY_WALLET_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new EscrowReleaseError(
      "[solana:wallet] Missing TREASURY_WALLET_SECRET_KEY. Provide the treasury private key as a base58-encoded 64-byte secret key.",
    );
  }

  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(secretKey);
  } catch (error) {
    throw new EscrowReleaseError("[solana:wallet] Invalid TREASURY_WALLET_SECRET_KEY.", error);
  }

  if (decoded.length !== 64) {
    throw new EscrowReleaseError(
      `[solana:wallet] Invalid TREASURY_WALLET_SECRET_KEY: expected 64 bytes, received ${decoded.length}.`,
    );
  }

  cachedTreasuryWallet = Keypair.fromSecretKey(decoded);
  return cachedTreasuryWallet;
}

function getTreasuryPublicKey(): PublicKey {
  const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS?.trim();

  if (treasuryAddress) {
    try {
      return new PublicKey(treasuryAddress);
    } catch (error) {
      throw new EscrowReleaseError(
        `[solana:wallet] Invalid TREASURY_WALLET_ADDRESS: ${treasuryAddress}`,
        error,
      );
    }
  }

  return getTreasuryWallet().publicKey;
}

class TreasuryAnchorWallet {
  get publicKey(): PublicKey {
    return getTreasuryPublicKey();
  }

  async signTransaction<T extends Transaction>(transaction: T): Promise<T> {
    transaction.partialSign(getTreasuryWallet());
    return transaction;
  }

  async signAllTransactions<T extends Transaction>(transactions: T[]): Promise<T[]> {
    return transactions.map((transaction) => {
      transaction.partialSign(getTreasuryWallet());
      return transaction;
    });
  }
}

function getEscrowProgram(): Program {
  const provider = new AnchorProvider(
    connection,
    new TreasuryAnchorWallet() as any,
    {
      commitment: "finalized",
      preflightCommitment: "finalized",
      skipPreflight: false,
    },
  );

  return new Program(ESCROW_IDL, provider);
}

export function invoiceIdToBytes(invoiceId: string): Uint8Array {
  const trimmed = invoiceId.trim();

  if (!trimmed) {
    throw new EscrowReleaseError("[solana:escrow] invoiceId is required.");
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Uint8Array.from(Buffer.from(trimmed, "hex"));
  }

  const encoded = Buffer.from(trimmed, "utf8");

  if (encoded.length > 32) {
    throw new EscrowReleaseError(
      "[solana:escrow] invoiceId must be 32 bytes or fewer when UTF-8 encoded, or exactly 64 hex characters.",
    );
  }

  const bytes = Buffer.alloc(32);
  encoded.copy(bytes);

  return Uint8Array.from(bytes);
}

function toUSDCBaseUnits(amount: number | string): bigint {
  const value = typeof amount === "number" ? amount.toString() : amount.trim();

  if (!value) {
    throw new EscrowDepositError("[solana:escrow] amount is required.");
  }

  if (value.includes("e") || value.includes("E")) {
    throw new EscrowDepositError(
      "[solana:escrow] amount must be a decimal value, not scientific notation.",
    );
  }

  const match = value.match(/^(?:(\d+)(?:\.(\d*))?|\.(\d+))$/);
  if (!match) {
    throw new EscrowDepositError(`[solana:escrow] Invalid USDC amount: ${value}`);
  }

  const whole = match[1] ?? "0";
  const fraction = match[2] ?? match[3] ?? "";
  if (fraction.length > USDC_DECIMALS) {
    throw new EscrowDepositError(
      `[solana:escrow] USDC supports ${USDC_DECIMALS} decimal places. Received ${fraction.length}.`,
    );
  }

  const baseUnits =
    BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) +
    BigInt(fraction.padEnd(USDC_DECIMALS, "0") || "0");

  if (baseUnits <= 0n) {
    throw new EscrowDepositError("[solana:escrow] amount must be greater than zero.");
  }

  return baseUnits;
}

export function deriveEscrowPda(invoiceId: string): {
  escrowPda: PublicKey;
  bump: number;
  invoiceIdBytes: Uint8Array;
} {
  const invoiceIdBytes = invoiceIdToBytes(invoiceId);
  const [escrowPda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      getTreasuryPublicKey().toBuffer(),
      Buffer.from(invoiceIdBytes),
    ],
    ESCROW_PROGRAM_ID,
  );

  return { escrowPda, bump, invoiceIdBytes };
}

export function deriveEscrowTokenAccounts({
  escrowPda,
  contractor,
  mint = DEVNET_USDC_MINT,
}: {
  escrowPda: PublicKey;
  contractor: PublicKey;
  mint?: PublicKey;
}): {
  vault: PublicKey;
  contractorTokenAccount: PublicKey;
} {
  return {
    vault: getAssociatedTokenAddressSync(
      mint,
      escrowPda,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    contractorTokenAccount: getAssociatedTokenAddressSync(
      mint,
      contractor,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  };
}

async function fetchEscrowAccount(
  program: Program,
  escrowPda: PublicKey,
): Promise<EscrowAccountData | null> {
  const raw = (await (program.account as any).escrowAccount.fetchNullable(
    escrowPda,
    "finalized",
  )) as Record<string, unknown> | null;

  if (!raw) {
    return null;
  }

  return {
    authority: raw.authority as PublicKey,
    mint: raw.mint as PublicKey,
    vault: raw.vault as PublicKey,
    amount: raw.amount as InstanceType<typeof BN>,
    isReleased: (raw.isReleased ?? raw.is_released) as boolean,
    bump: raw.bump as number,
    invoiceId: (raw.invoiceId ?? raw.invoice_id) as number[] | Uint8Array,
  };
}

function parseContractorWallet(contractorWallet: string): PublicKey {
  try {
    return new PublicKey(contractorWallet);
  } catch (error) {
    throw new EscrowReleaseError(
      `[solana:escrow] Invalid contractor wallet address: ${contractorWallet}`,
      error,
    );
  }
}

export async function getEscrowStatus(invoiceId: string): Promise<EscrowStatus> {
  const program = getEscrowProgram();
  const { escrowPda } = deriveEscrowPda(invoiceId);
  const vault = getAssociatedTokenAddressSync(
    DEVNET_USDC_MINT,
    escrowPda,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const escrowAccount = await fetchEscrowAccount(program, escrowPda);

  if (!escrowAccount) {
    return {
      exists: false,
      escrowPda: escrowPda.toBase58(),
      vault: vault.toBase58(),
    };
  }

  return {
    exists: true,
    escrowPda: escrowPda.toBase58(),
    vault: escrowAccount.vault.toBase58(),
    mint: escrowAccount.mint.toBase58(),
    amount: escrowAccount.amount.toString(),
    isReleased: escrowAccount.isReleased,
  };
}

async function confirmFinalized(signature: string, label: string): Promise<void> {
  const confirmation = await connection.confirmTransaction(signature, "finalized");

  if (confirmation.value.err) {
    throw new EscrowReleaseError(
      `[solana:escrow] ${label} transaction failed during finalized confirmation: ${JSON.stringify(
        confirmation.value.err,
      )}`,
    );
  }
}

export async function initializeEscrow({
  invoiceId,
}: InitializeEscrowParams): Promise<InitializeEscrowResult> {
  const treasuryWallet = getTreasuryWallet();
  const program = getEscrowProgram();
  const { escrowPda, invoiceIdBytes } = deriveEscrowPda(invoiceId);
  const vault = getAssociatedTokenAddressSync(
    DEVNET_USDC_MINT,
    escrowPda,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const existing = await fetchEscrowAccount(program, escrowPda);
  if (existing) {
    console.info("[solana:escrow] Escrow already initialized", {
      invoiceId,
      escrowPda: escrowPda.toBase58(),
      vault: existing.vault.toBase58(),
      amount: existing.amount.toString(),
      isReleased: existing.isReleased,
    });

    if (existing.isReleased) {
      throw new EscrowAlreadyReleasedError(invoiceId);
    }

    return {
      escrowPda: escrowPda.toBase58(),
      vault: existing.vault.toBase58(),
      alreadyInitialized: true,
    };
  }

  console.info("[solana:escrow] Initializing escrow", {
    invoiceId,
    escrowPda: escrowPda.toBase58(),
    vault: vault.toBase58(),
    mint: DEVNET_USDC_MINT.toBase58(),
    authority: treasuryWallet.publicKey.toBase58(),
  });

  try {
    const signature = await program.methods
      .initializeEscrow(Buffer.from(invoiceIdBytes))
      .accounts({
        authority: treasuryWallet.publicKey,
        mint: DEVNET_USDC_MINT,
        escrow: escrowPda,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([treasuryWallet])
      .rpc({
        commitment: "finalized",
        preflightCommitment: "finalized",
        skipPreflight: false,
      });

    await confirmFinalized(signature, "initialize escrow");

    console.info("[solana:escrow] Escrow initialized", {
      invoiceId,
      escrowPda: escrowPda.toBase58(),
      vault: vault.toBase58(),
      signature,
    });

    return {
      signature,
      escrowPda: escrowPda.toBase58(),
      vault: vault.toBase58(),
      alreadyInitialized: false,
    };
  } catch (error) {
    if (error instanceof EscrowReleaseError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[solana:escrow] Escrow initialization failed", {
      invoiceId,
      escrowPda: escrowPda.toBase58(),
      error: message,
    });
    throw new EscrowReleaseError(
      `[solana:escrow] Failed to initialize escrow: ${message}`,
      error,
    );
  }
}

export async function depositEscrow({
  invoiceId,
  amount,
}: DepositEscrowParams): Promise<DepositEscrowResult> {
  const treasuryWallet = getTreasuryWallet();
  const amountBaseUnits = toUSDCBaseUnits(amount);
  const program = getEscrowProgram();
  const { escrowPda } = deriveEscrowPda(invoiceId);
  const escrowAccount = await fetchEscrowAccount(program, escrowPda);

  if (!escrowAccount) {
    throw new EscrowNotFoundError(invoiceId, escrowPda);
  }

  if (escrowAccount.isReleased) {
    throw new EscrowAlreadyReleasedError(invoiceId);
  }

  if (!escrowAccount.mint.equals(DEVNET_USDC_MINT)) {
    throw new EscrowDepositError(
      `[solana:escrow] Escrow mint ${escrowAccount.mint.toBase58()} does not match configured USDC mint ${DEVNET_USDC_MINT.toBase58()}.`,
    );
  }

  const requiredAmount = new BN(amountBaseUnits.toString());

  if (escrowAccount.amount.eq(requiredAmount)) {
    console.info("[solana:escrow] Escrow already funded", {
      invoiceId,
      escrowPda: escrowPda.toBase58(),
      existingAmount: escrowAccount.amount.toString(),
      requiredAmount: amountBaseUnits.toString(),
    });

    return {
      escrowPda: escrowPda.toBase58(),
      vault: escrowAccount.vault.toBase58(),
      amountBaseUnits: amountBaseUnits.toString(),
      alreadyFunded: true,
    };
  }

  if (escrowAccount.amount.gt(requiredAmount)) {
    throw new EscrowDepositError(
      `[solana:escrow] Escrow holds more than the invoice amount (${escrowAccount.amount.toString()} base units); refusing to release an overfunded escrow automatically.`,
    );
  }

  if (escrowAccount.amount.gt(new BN(0))) {
    throw new EscrowDepositError(
      `[solana:escrow] Escrow is partially funded (${escrowAccount.amount.toString()} base units); refusing to deposit again automatically.`,
    );
  }

  const userTokenAccount = getUSDCAccount(treasuryWallet.publicKey);

  console.info("[solana:escrow] Depositing USDC into escrow", {
    invoiceId,
    escrowPda: escrowPda.toBase58(),
    vault: escrowAccount.vault.toBase58(),
    userTokenAccount: userTokenAccount.toBase58(),
    amountBaseUnits: amountBaseUnits.toString(),
  });

  try {
    const signature = await program.methods
      .deposit(new BN(amountBaseUnits.toString()))
      .accounts({
        user: treasuryWallet.publicKey,
        escrow: escrowPda,
        mint: escrowAccount.mint,
        userTokenAccount,
        vault: escrowAccount.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([treasuryWallet])
      .rpc({
        commitment: "finalized",
        preflightCommitment: "finalized",
        skipPreflight: false,
      });

    await confirmFinalized(signature, "deposit escrow");

    console.info("[solana:escrow] Escrow funded", {
      invoiceId,
      escrowPda: escrowPda.toBase58(),
      signature,
      amountBaseUnits: amountBaseUnits.toString(),
    });

    return {
      signature,
      escrowPda: escrowPda.toBase58(),
      vault: escrowAccount.vault.toBase58(),
      amountBaseUnits: amountBaseUnits.toString(),
      alreadyFunded: false,
    };
  } catch (error) {
    if (error instanceof EscrowReleaseError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[solana:escrow] Escrow deposit failed", {
      invoiceId,
      escrowPda: escrowPda.toBase58(),
      error: message,
    });
    throw new EscrowDepositError(
      `[solana:escrow] Failed to deposit escrow funds: ${message}`,
      error,
    );
  }
}

export async function releaseEscrow({
  invoiceId,
  contractorWallet,
}: ReleaseEscrowParams): Promise<ReleaseEscrowResult> {
  const treasuryWallet = getTreasuryWallet();
  const contractor = parseContractorWallet(contractorWallet);
  const program = getEscrowProgram();
  const { escrowPda } = deriveEscrowPda(invoiceId);
  const escrowAccount = await fetchEscrowAccount(program, escrowPda);

  console.info("[solana:escrow] Preparing escrow release", {
    invoiceId,
    escrowPda: escrowPda.toBase58(),
    contractorWallet: contractor.toBase58(),
  });

  if (!escrowAccount) {
    throw new EscrowNotFoundError(invoiceId, escrowPda);
  }

  if (escrowAccount.isReleased) {
    throw new EscrowAlreadyReleasedError(invoiceId);
  }

  if (!escrowAccount.mint.equals(DEVNET_USDC_MINT)) {
    throw new EscrowReleaseError(
      `[solana:escrow] Escrow mint ${escrowAccount.mint.toBase58()} does not match configured USDC mint ${DEVNET_USDC_MINT.toBase58()}.`,
    );
  }

  const { vault, contractorTokenAccount } = deriveEscrowTokenAccounts({
    escrowPda,
    contractor,
    mint: escrowAccount.mint,
  });

  if (!escrowAccount.vault.equals(vault)) {
    throw new EscrowReleaseError(
      `[solana:escrow] Escrow vault mismatch. Account stores ${escrowAccount.vault.toBase58()}, expected ${vault.toBase58()}.`,
    );
  }

  try {
    const signature = await program.methods
      .release()
      .accounts({
        authority: treasuryWallet.publicKey,
        escrow: escrowPda,
        mint: escrowAccount.mint,
        vault,
        contractor,
        contractorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([treasuryWallet])
      .rpc({
        commitment: "finalized",
        preflightCommitment: "finalized",
        skipPreflight: false,
      });

    await confirmFinalized(signature, "release escrow");

    console.info("[solana:escrow] Escrow released", {
      invoiceId,
      escrowPda: escrowPda.toBase58(),
      signature,
    });

    return {
      signature,
      escrowPda: escrowPda.toBase58(),
    };
  } catch (error) {
    if (error instanceof EscrowReleaseError) {
      console.error(error.message);
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[solana:escrow] Escrow release failed", {
      invoiceId,
      escrowPda: escrowPda.toBase58(),
      error: message,
    });
    throw new EscrowReleaseError(
      `[solana:escrow] Failed to release escrow: ${message}`,
      error,
    );
  }
}
