import { defineConfig } from "@playwright/test";

import { requireAuthEnvironment } from "./src/platform/auth/env";
import { loadDatabaseEnvironment } from "./src/platform/db/local-env";

loadDatabaseEnvironment();
// Dedicated local test server and capture handler share only a synthetic
// secret. Never require, persist or reuse a production authentication secret.
process.env.BETTER_AUTH_SECRET = "Synthetic-browser-test-secret.0123456789!";
process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
const { baseURL } = requireAuthEnvironment(process.env);
const origin = new URL(baseURL);
if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) {
  throw new Error("Browser DB tests require a local HTTP BETTER_AUTH_URL, never a deployed application.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL,
    channel: process.platform === "win32" ? "msedge" : undefined,
    // Magic tokens/session data must not be saved in trace/video artifacts.
    trace: "off", video: "off", screenshot: "off",
  },
  webServer: {
    command: `pnpm start --hostname ${origin.hostname} --port ${origin.port || "80"}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    env: {
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: baseURL,
    },
    timeout: 60_000,
  },
});
