import { contractors } from "@/lib/mock-data";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const contractor = contractors.find((item) => item.id === params.id);
  return contractor ? Response.json(contractor) : Response.json({ error: "Contractor not found" }, { status: 404 });
}
