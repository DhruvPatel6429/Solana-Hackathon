type SignupBody = {
  companyName?: string;
  planTier?: string;
};

export async function POST(request: Request) {
  let body: SignupBody = {};
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    body = {};
  }

  try {
    const { requireAuthenticatedUser } = await import("@/lib/auth/server");
    const { createOrGetCompanyForUser } = await import("@/lib/db/queries/companies");
    const { logSignupCreated } = await import("@/lib/services/audit.service");
    const user = await requireAuthenticatedUser(request);
    const company = await createOrGetCompanyForUser({
      userId: user.userId,
      companyName: body.companyName,
      planTier: body.planTier,
    });

    await logSignupCreated({
      companyId: company.id,
      actorUserId: user.userId,
      metadata: {
        planTier: company.planTier ?? null,
      },
    }).catch(() => undefined);

    return Response.json(
      {
        success: true,
        companyId: company.id,
      },
      { status: 201 },
    );
  } catch (error) {
    const { toHttpErrorResponse } = await import("@/lib/auth/http");
    return toHttpErrorResponse(error);
  }
}
