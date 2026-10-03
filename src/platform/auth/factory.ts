import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";

import type { Database } from "../db/connection.ts";
import * as schema from "../db/schema/index.ts";
import type { AuthEnvironment } from "./env.ts";

// Dependency injection is for schema tooling and real adapter tests. The application
// obtains credentials only through the server-only entry point in auth.ts.
export function createAuthentication(database: Database, environment: AuthEnvironment) {
  return betterAuth({
    database: drizzleAdapter(database, { provider: "pg", schema, usePlural: true }),
    secret: environment.secret,
    baseURL: environment.baseURL,
    advanced: { database: { generateId: "uuid" } },
    session: { cookieCache: { enabled: false } },
    emailAndPassword: { enabled: false },
    socialProviders: {},
    plugins: [],
    logger: {
      // Adapter errors can contain SQL parameters. Keep the severity, not raw data.
      log(level) {
        if (level === "error") console.error("Authentication error; details redacted.");
        else if (level === "warn") console.warn("Authentication warning; details redacted.");
      },
    },
  });
}
