import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAuthenticatedUser } from "@/lib/auth/server";
import { createOrGetCompanyForUser } from "@/lib/db/queries/companies";
import { logSignupCreated } from "@/lib/services/audit.service";

type SignupBody = {
  companyName?: string;
  planTier?: string;
};

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);

    let body: SignupBody = {};
    try {
      body = (await request.json()) as SignupBody;
    } catch {
      body = {};
    }

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
    return toHttpErrorResponse(error);
  }
}
