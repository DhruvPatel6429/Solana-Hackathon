type RouteContext = {
  params: Promise<{
    invoiceId: string;
  }>;
};

function errorResponse(message: string, status: number): Response {
  return Response.json(
    {
      success: false,
      error: message,
    },
    { status },
  );
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { invoiceId } = await context.params;

  try {
    const { requireTenantContext } = await import("@/lib/auth/server");
    const { prisma } = await import("@/lib/db/prisma");
    const tenant = await requireTenantContext(request);
    const db = prisma as any;
    const invoice = await db.invoice.findFirst({
      where: {
        id: invoiceId,
        companyId: tenant.companyId,
      },
      select: { id: true },
    });

    if (!invoice) {
      return errorResponse(`Invoice ${invoiceId} not found.`, 404);
    }

    const { getEscrowStatus } = await import("../../../../lib/solana/escrow");
    const escrow = await getEscrowStatus(invoiceId);

    return Response.json({
      success: true,
      escrow,
    });
  } catch (error) {
    const { AuthenticationError, TenantAccessError } = await import("@/lib/auth/server");
    const { toHttpErrorResponse } = await import("@/lib/auth/http");
    if (error instanceof AuthenticationError || error instanceof TenantAccessError) {
      return toHttpErrorResponse(error);
    }

    const message = error instanceof Error ? error.message : String(error);
    const status = message.toLowerCase().includes("escrow") ? 400 : 500;

    console.error("[api:escrow:status] Request failed", {
      invoiceId,
      status,
      error: message,
    });

    return errorResponse(message, status);
  }
}
