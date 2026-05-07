type ExecutePayoutRequestBody = {
  invoiceId?: unknown;
  wallet?: unknown;
  amount?: unknown;
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getStatusCode(error: unknown): number {
  const name = error instanceof Error ? error.name : "";
  if (name.includes("Validation") || name.includes("InvalidWalletAddress")) {
    return 400;
  }

  if (name.includes("DuplicatePayout")) {
    return 409;
  }

  if (name.includes("EscrowNotFound")) {
    return 404;
  }

  if (name.includes("EscrowAlreadyReleased")) {
    return 409;
  }

  if (name.includes("EscrowRelease") || name.includes("PayoutExecution")) {
    return 502;
  }

  return 500;
}

export async function POST(request: Request): Promise<Response> {
  let body: ExecutePayoutRequestBody;

  try {
    body = (await request.json()) as ExecutePayoutRequestBody;
  } catch {
    return errorResponse("Invalid JSON request body.", 400);
  }

  try {
    const { executePayout } = await import("../../../../lib/services/payout.service");
    const result = await executePayout({
      invoiceId: typeof body.invoiceId === "string" ? body.invoiceId : "",
      wallet: typeof body.wallet === "string" ? body.wallet : "",
      amount: typeof body.amount === "number" ? body.amount : Number.NaN,
    });

    return Response.json({
      success: true,
      txHash: result.txHash,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const status = getStatusCode(error);

    console.error("[api:payouts:execute] Request failed", {
      status,
      error: message,
    });

    return errorResponse(message, status);
  }
}
