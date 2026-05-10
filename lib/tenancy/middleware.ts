import { NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantRequestContext, type TenantRequestContext } from "@/lib/tenancy/context";
import type { ApiKeyScope } from "@/lib/tenancy/api-keys";

export async function withTenantMiddleware(
  request: Request,
  handler: (tenant: TenantRequestContext) => Promise<Response>,
  options: {
    allowApiKey?: boolean;
    allowedScopes?: ApiKeyScope[];
  } = {},
): Promise<Response> {
  try {
    const tenant = await requireTenantRequestContext(request, {
      allowApiKey: options.allowApiKey,
      allowedScopes: options.allowedScopes,
    });

    return await handler(tenant);
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}

export function tenantError(message: string, status = 400): Response {
  return NextResponse.json({ success: false, error: message }, { status });
}
