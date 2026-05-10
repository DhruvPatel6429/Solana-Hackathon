import { validateProductionEnv } from "../config/env";

const result = validateProductionEnv();
if (!result.ok) {
  console.error("[verify:prod] Invalid production environment:");
  for (const issue of result.issues) {
    console.error(`- ${issue.name} ${issue.message}`);
  }
  process.exit(1);
}

console.info("[verify:prod] Production environment schema is valid.");
console.info(JSON.stringify(result.config, null, 2));
