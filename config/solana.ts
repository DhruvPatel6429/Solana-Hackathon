export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  process.env.SOLANA_RPC_URL ??
  "https://api.devnet.solana.com";
