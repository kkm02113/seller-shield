import { makeSignature } from "better-auth/crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("server-only", () => ({}));
// Only Next's ambient request context is replaced; session verification and DB are real.
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`Redirect:${path}`); } }));
import { getAuth } from "../src/platform/auth/auth";
import { db } from "../src/platform/db/client";
import { withTenantContext } from "../src/modules/identity/application/context";
import { openTenancyDatabase, withTenancyFixture } from "./helpers/tenancy-fixtures";

const database = openTenancyDatabase();
const secret = "Synthetic-production-boundary-secret.0123456789!";
vi.stubEnv("BETTER_AUTH_SECRET", secret);
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
const auth = await getAuth();
const context = await auth.$context;
afterAll(async () => { await Promise.all([database.close(), db.$client.end({ timeout: 5 })]); vi.unstubAllEnvs(); });

describe("production session-bound tenant entry point", () => {
  it("binds the actor to requireUser's verified session despite client actor/role/tenant headers", async () => {
    await withTenancyFixture(database, async ({ a, b, tenantA, tenantB }) => {
      const session = await context.internalAdapter.createSession(a);
      const signed = `${session.token}.${await makeSignature(session.token, secret)}`;
      request.headers = new Headers({ cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(signed)}`,
        "x-actor-id": b, "x-role": "OWNER", "x-tenant-id": tenantB });
      expect(await withTenantContext(tenantA, async ({ actorId }) => actorId)).toBe(a);
      await expect(withTenantContext(tenantB, async () => 1)).rejects.toThrow("Workspace access denied.");
      request.headers = new Headers({ cookie: `${context.authCookies.sessionToken.name}=forged`, "x-actor-id": a });
      await expect(withTenantContext(tenantA, async () => 1)).rejects.toThrow("Redirect:/sign-in");
    });
  });
});
