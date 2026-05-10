import { NextResponse } from "next/server";
import { PublicKey, Keypair } from "@solana/web3.js";

import { connection } from "@/lib/solana/connection";
import { USDC_DECIMALS, DEVNET_USDC_MINT } from "@/lib/solana/tokens";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/treasury/balance
 *
 * Fetch the real USDC balance of the treasury wallet from Solana devnet.
 * Returns the balance in decimal USDC units with a source field indicating
 * whether the data came from Solana RPC or an error occurred.
 *
 * Success response (200):
 * {
 *   balance: number,           // USDC balance in decimal units (e.g., 1000.50)
 *   wallet: string,            // Treasury wallet public key
 *   source: "solana"
 * }
 *
 * Error response (200 with error flag):
 * {
 *   balance: 0,
 *   source: "error",
 *   error: string              // Error message for debugging
 * }
 */
export async function GET() {
  try {
    // Get treasury wallet address from environment
    const treasurySecretKey = process.env.TREASURY_WALLET_SECRET_KEY;
    if (!treasurySecretKey) {
      return NextResponse.json(
        {
          balance: 0,
          source: "error",
          error: "TREASURY_WALLET_SECRET_KEY not configured",
        },
        { status: 200 }
      );
    }

    // Parse the treasury wallet public key
    // Import Keypair to derive the public key from the secret key
    const bs58 = (await import("bs58")).default;
    const { Keypair } = await import("@solana/web3.js");

    let treasuryKeypair: Keypair;
    try {
      const decoded = bs58.decode(treasurySecretKey);
      if (decoded.length !== 64) {
        throw new Error(`Invalid secret key length: ${decoded.length}, expected 64`);
      }
      treasuryKeypair = Keypair.fromSecretKey(decoded);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse secret key";
      return NextResponse.json(
        {
          balance: 0,
          source: "error",
          error: `Invalid TREASURY_WALLET_SECRET_KEY: ${message}`,
        },
        { status: 200 }
      );
    }

    const treasuryWallet = treasuryKeypair.publicKey;
    const treasuryWalletString = treasuryWallet.toBase58();

    // Get all token accounts owned by the treasury wallet for USDC
    let tokenAccounts;
    try {
      tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        treasuryWallet,
        { mint: DEVNET_USDC_MINT }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch token accounts";
      console.error("[treasury:balance] RPC call failed:", message);
      return NextResponse.json(
        {
          balance: 0,
          source: "error",
          error: `Failed to fetch token accounts from Solana: ${message}`,
        },
        { status: 200 }
      );
    }

    // Find the USDC account with balance
    let decimalBalance = 0;
    if (tokenAccounts.value && tokenAccounts.value.length > 0) {
      const usdcAccount = tokenAccounts.value[0];
      const tokenAmount = usdcAccount.account.data.parsed.info.tokenAmount;
      const rawBalance = BigInt(tokenAmount.amount);
      decimalBalance = Number(rawBalance) / Math.pow(10, USDC_DECIMALS);

      console.info("[treasury:balance] Successfully fetched balance", {
        wallet: treasuryWalletString,
        tokenAccount: usdcAccount.pubkey.toBase58(),
        rawBalance: rawBalance.toString(),
        decimalBalance,
      });
    } else {
      console.warn("[treasury:balance] No USDC token account found for wallet", {
        wallet: treasuryWalletString,
      });
    }

    return NextResponse.json(
      {
        balance: decimalBalance,
        wallet: treasuryWalletString,
        source: "solana",
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[treasury:balance] Unexpected error:", message);
    return NextResponse.json(
      {
        balance: 0,
        source: "error",
        error: `Unexpected server error: ${message}`,
      },
      { status: 200 }
    );
  }
}
