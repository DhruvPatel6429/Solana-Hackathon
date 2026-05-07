import "dotenv/config";
import { executeBatchPayout } from "../lib/solana/transfer";

async function main() {
  const result = await executeBatchPayout([
    { wallet: "WALLET_1", amount: 0.1 },
    { wallet: "WALLET_2", amount: 0.2 },
    { wallet: "WALLET_3", amount: 0.3 },
  ]);

  console.log("Batch TX:", result.signature);
}

main().catch(console.error);