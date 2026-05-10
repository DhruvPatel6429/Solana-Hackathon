import { PublicKey } from "@solana/web3.js";

import { connection } from "../lib/solana/connection";
import { ESCROW_PROGRAM_ID } from "../lib/solana/escrow";

const programId = process.env.ESCROW_PROGRAM_ID
  ? new PublicKey(process.env.ESCROW_PROGRAM_ID)
  : ESCROW_PROGRAM_ID;
const account = await connection.getAccountInfo(programId);

if (!account?.executable) {
  throw new Error(`Escrow program ${programId.toBase58()} is not deployed or is not executable.`);
}

console.log(`Verified escrow program ${programId.toBase58()} on configured Solana cluster.`);
