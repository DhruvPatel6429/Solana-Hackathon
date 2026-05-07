export async function POST(request: Request) {
  const body = await request.json().catch(() => ({ tier: "growth" }));
  const tier = typeof body.tier === "string" ? body.tier : "growth";
  return Response.json({ url: `/onboarding?checkout=${encodeURIComponent(tier)}` });
}
