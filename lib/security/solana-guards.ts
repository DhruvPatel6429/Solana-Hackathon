import { PublicKey } from "@solana/web3.js";

export class SolanaGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SolanaGuardError";
  }
}

const DEFAULT_ESCROW_PROGRAM_ID = "HukqmD9GfmVya8ASPrY7ELEmuJXy8PxA4Mvm7PsQEjgE";

function parseCsvSet(value?: string): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function assertProgramIdAllowed(): void {
  const configured = new PublicKey(
    process.env.ESCROW_PROGRAM_ID ?? DEFAULT_ESCROW_PROGRAM_ID,
  ).toBase58();
  const allowed = parseCsvSet(process.env.ALLOWED_ESCROW_PROGRAM_IDS);

  if (allowed.size > 0 && !allowed.has(configured)) {
    throw new SolanaGuardError(
      `Escrow program ${configured} is not in ALLOWED_ESCROW_PROGRAM_IDS.`,
    );
  }
}

export function assertTreasuryWhitelisted(walletAddress?: string): void {
  const treasury = walletAddress ?? process.env.TREASURY_WALLET_ADDRESS;
  const allowed = parseCsvSet(process.env.TREASURY_WALLET_WHITELIST);
  if (allowed.size > 0 && (!treasury || !allowed.has(treasury))) {
    throw new SolanaGuardError(`Treasury wallet ${treasury ?? "[missing]"} is not whitelisted.`);
  }
}

export function assertRecipientAllowed(walletAddress: string, treasuryAddress?: string): PublicKey {
  let publicKey: PublicKey;
  try {
    publicKey = new PublicKey(walletAddress);
  } catch (error) {
    throw new SolanaGuardError(`Invalid recipient wallet: ${walletAddress}`);
  }

  const base58 = publicKey.toBase58();
  if (base58 === "11111111111111111111111111111111" && process.env.NODE_ENV !== "test") {
    throw new SolanaGuardError("Recipient wallet cannot be the system default address.");
  }

  const treasury = treasuryAddress ?? process.env.TREASURY_WALLET_ADDRESS;
  if (treasury && base58 === treasury) {
    throw new SolanaGuardError("Recipient wallet cannot be the treasury wallet.");
  }

  const blacklist = parseCsvSet(process.env.RECIPIENT_WALLET_BLACKLIST);
  if (blacklist.has(base58)) {
    throw new SolanaGuardError("Recipient wallet is blacklisted.");
  }

  return publicKey;
}

export function assertSolanaExecutionGuards(recipientWallet: string): void {
  assertProgramIdAllowed();
  assertTreasuryWhitelisted();
  assertRecipientAllowed(recipientWallet);
}
