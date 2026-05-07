import assert from "node:assert/strict";
import test from "node:test";

import { readEnv } from "@/config/env";

test("readEnv returns default when value is missing", () => {
  const value = readEnv("MISSING_ENV_FOR_TEST", { defaultValue: "fallback" });
  assert.equal(value, "fallback");
});

test("readEnv throws when required value is missing", () => {
  assert.throws(
    () => readEnv("MISSING_REQUIRED_ENV_FOR_TEST", { required: true }),
    /Missing required environment variable/,
  );
});
