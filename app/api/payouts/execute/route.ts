import {
  DuplicatePayoutError,
  executePayout,
  PayoutExecutionError,
  PayoutValidationError,
} from "../../../../lib/services/payout.service";
import {
  InsufficientBalanceError,
  InvalidWalletAddressError,
  SolanaTransferError,
} from "../../../../lib/solana/transfer";

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
  if (
    error instanceof PayoutValidationError ||
    error instanceof InvalidWalletAddressError
  ) {
    return 400;
  }

  if (error instanceof DuplicatePayoutError) {
    return 409;
  }

  if (error instanceof InsufficientBalanceError) {
    return 400;
  }

  if (
    error instanceof SolanaTransferError ||
    error instanceof PayoutExecutionError
  ) {
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
