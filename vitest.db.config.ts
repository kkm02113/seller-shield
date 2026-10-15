import { defineConfig } from "vitest/config";
import { loadDatabaseTestEnvironment } from "./tests/helpers/database-test-environment.ts";

loadDatabaseTestEnvironment();

export default defineConfig({
  test: {
    environment: "node",
    // Upstream verification lookup can prune expired records globally. Keep
    // shared local DB fixture files sequential; never alter production cleanup.
    fileParallelism: false,
    include: ["tests/**/*.integration.test.{ts,tsx}"],
  },
});
