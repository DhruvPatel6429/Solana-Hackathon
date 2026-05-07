export async function POST() {
  return Response.json({ success: true, companyId: "company_demo_01" }, { status: 201 });
}
