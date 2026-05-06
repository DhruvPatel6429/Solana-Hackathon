import bs58 from "bs58";

try {
  const decoded = bs58.decode(process.env.TREASURY_WALLET_SECRET_KEY!);
  console.log("Valid base58 key:", decoded.length);
} catch (e) {
  console.error("Invalid base58 key");
}