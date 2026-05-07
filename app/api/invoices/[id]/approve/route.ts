import { payouts } from "@/lib/mock-data";

export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  return Response.json({ success: true, invoiceId: params.id, txHash: payouts[0]?.txHash ?? "5J7mV8fYbLr1pU35Hk3wPHajYxXbhJ8QX7WdUkbMc3mQ" });
}
