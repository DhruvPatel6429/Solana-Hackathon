import assert from "node:assert/strict";
import test from "node:test";

import { GET as payoutsGet } from "@/app/api/payouts/route";

test("payouts route rejects missing bearer token", async () => {
  const response = await payoutsGet(new Request("http://localhost/api/payouts"));
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.error, /Authorization/i);
});
