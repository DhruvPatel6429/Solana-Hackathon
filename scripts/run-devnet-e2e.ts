import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "--test-concurrency=1", "tests/e2e/**/*.test.ts"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      RUN_DEVNET_E2E: "1",
    },
  },
);

process.exit(result.status ?? 1);
