import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/platform/db/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
