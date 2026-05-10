import { spawnSync } from "node:child_process";

if (process.env.NODE_ENV !== "production") {
  console.warn("[db:migrate:prod] NODE_ENV is not production; continuing because this may be a CI dry run.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  throw new Error("Production migration failed.");
}
