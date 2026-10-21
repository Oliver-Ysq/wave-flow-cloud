import { defineConfig } from "drizzle-kit";

/** Drizzle Kit 配置：generate 从 schema 推导迁移 SQL；url 仅 migrate/studio 需要。 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
