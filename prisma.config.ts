import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const localGenerateDatabaseUrl = "postgresql://user:password@localhost:5432/borderless";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? localGenerateDatabaseUrl,
  },
});
