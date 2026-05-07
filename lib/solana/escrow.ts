import {
  AnchorProvider,
  BN,
  Idl,
  Program,
} from "@project-serum/anchor";
import {
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
import { DEVNET_USDC_MINT } from "./tokens";
import { treasuryWallet } from "./wallet";

const DEFAULT_ESCROW_PROGRAM_ID = "HukqmD9GfmVya8ASPrY7ELEmuJXy8PxA4Mvm7PsQEjgE";

export const ESCROW_PROGRAM_ID = new PublicKey(
  process.env.ESCROW_PROGRAM_ID ?? DEFAULT_ESCROW_PROGRAM_ID,
);

const ESCROW_IDL = {
  version: "0.1.0",
  name: "escrow",
  instructions: [
    {
      name: "release",
      accounts: [
        { name: "authority", isMut: true, isSigner: true },
        { name: "escrow", isMut: true, isSigner: false },
        { name: "mint", isMut: false, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "contractor", isMut: false, isSigner: false },
        { name: "contractorTokenAccount", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
        { name: "associatedTokenProgram", isMut: false, isSigner: false },
        { name: "rent", isMut: false, isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "EscrowAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "publicKey" },
          { name: "mint", type: "publicKey" },
          { name: "vault", type: "publicKey" },
          { name: "amount", type: "u64" },
          { name: "isReleased", type: "bool" },
          { name: "bump", type: "u8" },
          { name: "invoiceId", type: { array: ["u8", 32] } },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "Unauthorized", msg: "Only the escrow authority can release funds." },
    { code: 6001, name: "AlreadyReleased", msg: "Escrow funds have already been released." },
    {
      code: 6002,
      name: "InvalidAmount",
      msg: "Amount must be greater than zero and fit safely in escrow state.",
    },
    { code: 6003, name: "InvalidAuthority", msg: "Signer does not match the escrow authority." },
  ],
} as unknown as Idl;

type EscrowAccountData = {
  authority: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  amount: BN;
  isReleased: boolean;
  bump: number;
  invoiceId: number[];
};

export type ReleaseEscrowParams = {
  invoiceId: string;
  contractorWallet: string;
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

class TreasuryAnchorWallet {
  public readonly publicKey = treasuryWallet.publicKey;

  async signTransaction<T extends Transaction>(transaction: T): Promise<T> {
    transaction.partialSign(treasuryWallet);
    return transaction;
  }

  async signAllTransactions<T extends Transaction>(transactions: T[]): Promise<T[]> {
    return transactions.map((transaction) => {
      transaction.partialSign(treasuryWallet);
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
      preflightCommitment: "confirmed",
      skipPreflight: false,
    },
  );

  return new Program(ESCROW_IDL, ESCROW_PROGRAM_ID, provider);
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

export function deriveEscrowPda(invoiceId: string): {
  escrowPda: PublicKey;
  bump: number;
  invoiceIdBytes: Uint8Array;
} {
  const invoiceIdBytes = invoiceIdToBytes(invoiceId);
  const [escrowPda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      treasuryWallet.publicKey.toBuffer(),
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
  return (await (program.account as any).escrowAccount.fetchNullable(
    escrowPda,
    "confirmed",
  )) as EscrowAccountData | null;
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

export async function releaseEscrow({
  invoiceId,
  contractorWallet,
}: ReleaseEscrowParams): Promise<ReleaseEscrowResult> {
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
        preflightCommitment: "confirmed",
        skipPreflight: false,
      });

    const confirmation = await connection.confirmTransaction(
      signature,
      "finalized",
    );

    if (confirmation.value.err) {
      throw new EscrowReleaseError(
        `[solana:escrow] Release transaction failed during finalized confirmation: ${JSON.stringify(
          confirmation.value.err,
        )}`,
      );
    }

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
