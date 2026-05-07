import { treasury } from "@/lib/mock-data";

export async function GET() {
  return Response.json({ balance: treasury.balance, wallet: treasury.wallet });
}
