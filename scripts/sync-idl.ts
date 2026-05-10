import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = resolve("target/idl/escrow.json");
const destination = resolve("lib/solana/idl/escrow.json");

if (!existsSync(source)) {
  throw new Error(`IDL not found at ${source}. Run npm run anchor:build first.`);
}

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);

console.log(`Synced escrow IDL to ${destination}`);
