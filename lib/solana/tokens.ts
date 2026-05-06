import { PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export const USDC_DECIMALS = 6;

export const DEVNET_USDC_MINT = new PublicKey(
  "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr",
);

export function getAssociatedTokenAccount(
  owner: PublicKey,
  mint: PublicKey = DEVNET_USDC_MINT,
): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}

export function getUSDCAccount(owner: PublicKey): PublicKey {
  return getAssociatedTokenAccount(owner, DEVNET_USDC_MINT);
}
