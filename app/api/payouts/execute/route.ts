type ExecutePayoutRequestBody = {
  invoiceId?: unknown;
  wallet?: unknown;
  walletAddress?: unknown;
  amount?: unknown;
  amountUsdc?: unknown;
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

  if (name.includes("PayoutInvoiceNotFound")) {
    return 404;
  }

  if (name.includes("PayoutExecution") || name.includes("SolanaTransfer")) {
    return 500;
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
    const wallet = typeof body.wallet === "string"
      ? body.wallet
      : typeof body.walletAddress === "string"
        ? body.walletAddress
        : "";
    const amount = typeof body.amount === "number"
      ? body.amount
      : typeof body.amountUsdc === "number"
        ? body.amountUsdc
        : Number.NaN;

    const result = await executePayout({
      invoiceId: typeof body.invoiceId === "string" ? body.invoiceId : "",
      wallet,
      amount,
    });

    return Response.json({
      success: true,
      txHash: result.txHash,
      txSignature: result.txHash,
      payout: {
        id: result.payoutId,
        status: result.status,
        txSignature: result.txHash,
        solanaTxSignature: result.txHash,
      },
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
