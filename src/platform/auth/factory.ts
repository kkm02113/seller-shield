import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins/magic-link";

import type { Database } from "../db/connection.ts";
import * as schema from "../db/schema/index.ts";
import type { AuthEnvironment } from "./env.ts";
import type { EmailSender } from "../email/sender.ts";
import { buildMagicLinkEmail } from "./magic-link.ts";
import { parseMagicLinkBody, parseMagicLinkQuery, parseName } from "./validation.ts";

// Dependency injection is for schema tooling and real adapter tests. The application
// obtains credentials only through the server-only entry point in auth.ts.
export function createAuthentication(database: Database, environment: AuthEnvironment, sender?: EmailSender) {
  return betterAuth({
    database: drizzleAdapter(database, { provider: "pg", schema, usePlural: true }),
    secret: environment.secret,
    baseURL: environment.baseURL,
    advanced: { database: { generateId: "uuid" } },
    session: { cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database" },
    emailAndPassword: { enabled: false },
    socialProviders: {},
    plugins: [magicLink({
      expiresIn: 300, storeToken: "hashed", disableSignUp: false,
      rateLimit: { window: 60, max: 5 },
      async sendMagicLink({ email, token }) {
        try {
          if (!sender) throw new Error("Sender unavailable.");
          await sender.send(buildMagicLinkEmail(email, environment.baseURL, token));
        } catch {
          throw new APIError("SERVICE_UNAVAILABLE", { code: "EMAIL_UNAVAILABLE", message: "Email delivery unavailable." });
        }
      },
    })],
    hooks: {
      before: createAuthMiddleware(async (context) => {
        try {
          if (context.path === "/sign-in/magic-link") return { context: { body: parseMagicLinkBody(context.body) } };
          if (context.path === "/magic-link/verify") return { context: { query: parseMagicLinkQuery(context.query) } };
        } catch {
          throw new APIError("BAD_REQUEST", { code: "INVALID_AUTH_REQUEST", message: "Invalid authentication request." });
        }
      }),
    },
    databaseHooks: {
      user: { update: { async before(user) {
        if (user.name === undefined) return;
        try { return { data: { ...user, name: parseName(user.name) } }; }
        catch { throw new APIError("BAD_REQUEST", { code: "INVALID_NAME", message: "Invalid name." }); }
      } } },
    },
    logger: {
      // Adapter errors can contain SQL parameters. Keep the severity, not raw data.
      log(level) {
        if (level === "error") console.error("Authentication error; details redacted.");
        else if (level === "warn") console.warn("Authentication warning; details redacted.");
      },
    },
  });
}
