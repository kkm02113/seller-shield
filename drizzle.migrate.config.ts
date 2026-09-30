import { defineConfig } from "drizzle-kit";

import { requireMigrationDatabaseUrl } from "./src/platform/db/env.ts";
import { loadDatabaseEnvironment } from "./src/platform/db/local-env.ts";

loadDatabaseEnvironment();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/platform/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: requireMigrationDatabaseUrl(process.env),
  },
  strict: true,
  verbose: true,
});
