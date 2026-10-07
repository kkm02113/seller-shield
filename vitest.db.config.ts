import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Upstream verification lookup can prune expired records globally. Keep
    // shared local DB fixture files sequential; never alter production cleanup.
    fileParallelism: false,
    include: ["tests/**/*.integration.test.{ts,tsx}"],
  },
});
