export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  return Response.json({ success: true, invoiceId: params.id });
}
