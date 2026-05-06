import "dotenv/config";

async function main() {
  const toWallet = process.env.TEST_RECIPIENT_WALLET ?? process.argv[2];
  const amount = process.env.TEST_TRANSFER_AMOUNT_USDC ?? process.argv[3] ?? "0.01";

  if (!toWallet) {
    throw new Error(
      "Missing recipient wallet. Set TEST_RECIPIENT_WALLET or pass it as the first argument.",
    );
  }

  const [{ treasuryWallet }, { transferUSDC }] = await Promise.all([
    import("../lib/solana/wallet"),
    import("../lib/solana/transfer"),
  ]);

  console.info("[scripts:test-transfer] Starting devnet USDC transfer", {
    treasury: treasuryWallet.publicKey.toBase58(),
    recipient: toWallet,
    amount,
  });

  const signature = await transferUSDC({
    fromWallet: treasuryWallet,
    toWallet,
    amount,
  });

  console.info("[scripts:test-transfer] Transfer finalized", { signature });
  console.info(
    `[scripts:test-transfer] Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[scripts:test-transfer] Failed", { message });
  process.exitCode = 1;
});
