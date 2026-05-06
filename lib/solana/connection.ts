import { clusterApiUrl, Commitment, Connection } from "@solana/web3.js";

const DEFAULT_COMMITMENT: Commitment = "confirmed";

export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";

export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");

if (SOLANA_NETWORK !== "devnet") {
  console.warn(
    `[solana:connection] Expected devnet for this payout engine, received "${SOLANA_NETWORK}". Using RPC: ${SOLANA_RPC_URL}`,
  );
}

export const connection = new Connection(SOLANA_RPC_URL, {
  commitment: DEFAULT_COMMITMENT,
  confirmTransactionInitialTimeout: 60_000,
});
