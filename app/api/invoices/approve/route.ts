import { payouts } from "@/lib/mock-data";

export async function PATCH() {
  return Response.json({ success: true, txHash: payouts[0]?.txHash ?? "5J7mV8fYbLr1pU35Hk3wPHajYxXbhJ8QX7WdUkbMc3mQ" });
}
