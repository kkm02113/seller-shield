import { describe, expect, it } from "vitest";

import * as authentication from "../src/platform/auth/factory";
import { createDatabaseConnection } from "../src/platform/db/connection";

describe("authentication persistence configuration", () => {
  it("uses UUID DB sessions and only Magic Link, never password/social/tenant plugins", async () => {
    // Constructing the lazy client does not connect to this deliberately unreachable URL.
    const connection = createDatabaseConnection("postgresql://unused:unused@127.0.0.1:1/unused");
    try {
      const auth = authentication.createAuthentication(connection.db, {
        secret: "Synthetic-test-only-secret.0123456789!",
        baseURL: "http://localhost:3000",
      });
      expect(auth.options.advanced?.database?.generateId).toBe("uuid");
      expect(auth.options.session?.cookieCache?.enabled).toBe(false);
      expect("secondaryStorage" in auth.options).toBe(false);
      expect(auth.options.emailAndPassword?.enabled).toBe(false);
      expect(auth.options.socialProviders).toEqual({});
      expect(auth.options.plugins?.map((plugin) => plugin.id)).toEqual(["magic-link"]);
      expect(auth.options.baseURL).toBe("http://localhost:3000");
      expect(auth.options.rateLimit?.enabled).toBe(true);
      expect(auth.options.rateLimit?.storage).toBe("database");
    } finally {
      await connection.client.end({ timeout: 1 });
    }
  });
});
