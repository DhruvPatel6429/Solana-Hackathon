import { transferWithSplit } from "../lib/solana/transfer";

async function main() {
  const result = await transferWithSplit({
    contractorWallet: "YOUR_SECOND_PHANTOM_WALLET",
    feeWallet: "YOUR_FIRST_PHANTOM_WALLET", // or another wallet
    amount: 1,
  });

  console.log("Split TX:", result.signature);
}

main().catch(console.error);