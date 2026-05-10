import { spawnSync } from "node:child_process";

const environment = process.argv[2];

if (!environment || !["staging", "production"].includes(environment)) {
  throw new Error("Usage: tsx scripts/deploy.ts <staging|production>");
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

console.info(`[deploy] Validating ${environment} release`);
run("npm", ["run", "typecheck"]);
run("npm", ["test"]);
run("npm", ["run", "build"]);
run("npm", ["run", "verify:prod"]);

console.info(`[deploy] ${environment} artifact is validated. Connect this script to the target platform deploy command.`);
