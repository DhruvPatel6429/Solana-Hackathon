import { invoices } from "@/lib/mock-data";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const invoice = invoices.find((item) => item.id === params.id);
  return invoice ? Response.json(invoice) : Response.json({ error: "Invoice not found" }, { status: 404 });
}
