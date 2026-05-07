import {
  EscrowReleaseError,
  getEscrowStatus,
} from "../../../../lib/solana/escrow";

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
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { invoiceId } = await context.params;

  try {
    const escrow = await getEscrowStatus(invoiceId);

    return Response.json({
      success: true,
      escrow,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof EscrowReleaseError ? 400 : 500;

    console.error("[api:escrow:status] Request failed", {
      invoiceId,
      status,
      error: message,
    });

    return errorResponse(message, status);
  }
}
