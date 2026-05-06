import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

const TREASURY_SECRET_ENV = "TREASURY_WALLET_SECRET_KEY";

function loadTreasuryWallet(): Keypair {
  const secretKey = process.env[TREASURY_SECRET_ENV];

  if (!secretKey) {
    throw new Error(
      `[solana:wallet] Missing ${TREASURY_SECRET_ENV}. Provide the treasury private key as a base58-encoded 64-byte secret key.`,
    );
  }

  try {
    const decoded = bs58.decode(secretKey);

    if (decoded.length !== 64) {
      throw new Error(`expected 64 bytes, received ${decoded.length}`);
    }

    const keypair = Keypair.fromSecretKey(decoded);
    console.info(
      `[solana:wallet] Loaded treasury wallet ${keypair.publicKey.toBase58()}`,
    );

    return keypair;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      `[solana:wallet] Invalid ${TREASURY_SECRET_ENV}: ${message}`,
    );
  }
}

export const treasuryWallet = loadTreasuryWallet();
