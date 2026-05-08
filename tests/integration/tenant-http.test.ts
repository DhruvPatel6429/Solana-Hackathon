import assert from "node:assert/strict";
import test from "node:test";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { AuthenticationError, TenantAccessError } from "@/lib/auth/server";

test("toHttpErrorResponse maps AuthenticationError to 401", async () => {
  const response = toHttpErrorResponse(new AuthenticationError("No token"));
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "No token");
});

test("toHttpErrorResponse maps TenantAccessError to 403", async () => {
  const response = toHttpErrorResponse(new TenantAccessError("No membership"));
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "No membership");
});
