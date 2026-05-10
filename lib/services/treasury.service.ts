import { PublicKey } from "@solana/web3.js";

import { prisma } from "@/lib/db/prisma";
import { connection } from "@/lib/solana/connection";
import { DEVNET_USDC_MINT, USDC_DECIMALS } from "@/lib/solana/tokens";

const db = prisma as any;

type HeliusTokenTransfer = {
  mint?: string;
  fromUserAccount?: string;
  toUserAccount?: string;
  fromTokenAccount?: string;
  toTokenAccount?: string;
  tokenAmount?: number;
  rawTokenAmount?: {
    tokenAmount?: string;
    decimals?: number;
  };
};

type HeliusTransaction = {
  signature?: string;
  transactionError?: unknown;
  slot?: number;
  source?: string;
  type?: string;
  tokenTransfers?: HeliusTokenTransfer[];
};

function amountFromTransfer(transfer: HeliusTokenTransfer): number {
  if (typeof transfer.tokenAmount === "number" && Number.isFinite(transfer.tokenAmount)) {
    return transfer.tokenAmount;
  }

  const raw = transfer.rawTokenAmount?.tokenAmount;
  const decimals = transfer.rawTokenAmount?.decimals ?? USDC_DECIMALS;
  if (!raw) return 0;
  return Number(BigInt(raw)) / 10 ** decimals;
}

export function verifyHeliusWebhook(request: Request): void {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("HELIUS_WEBHOOK_SECRET is required.");
  }

  const headerSecret =
    request.headers.get("x-helius-webhook-secret") ??
    request.headers.get("helius-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (headerSecret !== secret) {
    throw new Error("Invalid Helius webhook secret.");
  }
}

export async function getTreasuryBalance(walletAddress: string): Promise<number> {
  const wallet = new PublicKey(walletAddress);
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet, {
    mint: DEVNET_USDC_MINT,
  });

  const tokenAmount = tokenAccounts.value[0]?.account.data.parsed.info.tokenAmount;
  if (!tokenAmount?.amount) {
    return 0;
  }

  return Number(BigInt(tokenAmount.amount)) / 10 ** USDC_DECIMALS;
}

export async function processHeliusTreasuryWebhook(payload: unknown) {
  const transactions = Array.isArray(payload) ? payload : [payload];
  const processed: Array<{ signature: string; direction: string; amountUsdc: number }> = [];

  for (const tx of transactions as HeliusTransaction[]) {
    if (!tx.signature || tx.transactionError) {
      continue;
    }

    for (const transfer of tx.tokenTransfers ?? []) {
      if (transfer.mint !== DEVNET_USDC_MINT.toBase58()) {
        continue;
      }

      const source = transfer.fromUserAccount ?? transfer.fromTokenAccount;
      const destination = transfer.toUserAccount ?? transfer.toTokenAccount;
      const company = await db.company.findFirst({
        where: {
          OR: [
            destination ? { treasuryWalletAddress: destination } : undefined,
            source ? { treasuryWalletAddress: source } : undefined,
          ].filter(Boolean),
        },
      });

      if (!company?.treasuryWalletAddress) {
        continue;
      }

      const direction = destination === company.treasuryWalletAddress ? "INCOMING" : "OUTGOING";
      const amountUsdc = amountFromTransfer(transfer);
      if (amountUsdc <= 0) {
        continue;
      }

      await db.treasuryTransaction.upsert({
        where: { signature: tx.signature },
        create: {
          companyId: company.id,
          signature: tx.signature,
          walletAddress: company.treasuryWalletAddress,
          amountUsdc: amountUsdc.toString(),
          direction,
          source,
          destination,
          slot: tx.slot ? BigInt(tx.slot) : undefined,
        },
        update: {
          companyId: company.id,
          walletAddress: company.treasuryWalletAddress,
          amountUsdc: amountUsdc.toString(),
          direction,
          source,
          destination,
          slot: tx.slot ? BigInt(tx.slot) : undefined,
        },
      });

      let liveBalance: number;
      try {
        liveBalance = await getTreasuryBalance(company.treasuryWalletAddress);
      } catch (error) {
        const currentBalance = Number(company.treasuryBalanceUsdc ?? 0);
        liveBalance =
          direction === "INCOMING"
            ? currentBalance + amountUsdc
            : Math.max(0, currentBalance - amountUsdc);
        console.error("[treasury:helius] Balance reconciliation RPC failed; using webhook delta", {
          companyId: company.id,
          signature: tx.signature,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await db.company.update({
        where: { id: company.id },
        data: {
          treasuryBalanceUsdc: liveBalance.toString(),
          treasuryBalanceUpdatedAt: new Date(),
        },
      });

      if (direction === "OUTGOING") {
        await db.payout.updateMany({
          where: {
            txSignature: tx.signature,
            companyId: company.id,
          },
          data: { status: "CONFIRMED" },
        });
      }

      processed.push({ signature: tx.signature, direction, amountUsdc });
    }
  }

  return processed;
}
