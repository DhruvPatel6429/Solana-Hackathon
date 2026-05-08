import { AuthenticationError, TenantAccessError } from "@/lib/auth/server";

export function toHttpErrorResponse(error: unknown): Response {
  if (error instanceof AuthenticationError || error instanceof TenantAccessError) {
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";

  return Response.json(
    {
      success: false,
      error: message,
    },
    { status: 500 },
  );
}
