import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { createAuthentication } from "../src/platform/auth/factory";
import { createTenantBoundary } from "../src/platform/db/tenant-context";
import { openTenancyDatabase, withTenancyFixture } from "./helpers/tenancy-fixtures";

const database = openTenancyDatabase(1);
const secret = "Synthetic-tenant-context-secret.0123456789!";
const auth = createAuthentication(database.db, { secret, baseURL: "http://localhost:3000" });
const authContext = await auth.$context;
afterAll(() => database.close());

async function boundaryFor(actor: string, forged: Record<string, string> = {}) {
  const session = await authContext.internalAdapter.createSession(actor);
  const signature = `${session.token}.${await makeSignature(session.token, secret)}`;
  const headers = new Headers({ cookie: `${authContext.authCookies.sessionToken.name}=${encodeURIComponent(signature)}`, ...forged });
  return createTenantBoundary(database.db, async () => (await auth.api.getSession({ headers }))?.user ?? null);
}

describe("verified-session actor-first tenant context", () => {
  it("uses the verified session actor, locked membership and canonical tenant, not forged headers", async () => {
    await withTenancyFixture(database, async ({ a, b, tenantA, tenantB, membershipA }) => {
      const boundary = await boundaryFor(a, { "x-actor-id": b, "x-tenant-id": tenantB, "x-role": "OWNER" });
      const context = await boundary.withTenantContext(tenantA, async ({ actorId, tenantId, membershipId, role, tx }) => {
        const [settings] = await tx.execute(sql`select current_setting('app.actor_id') as actor,
          current_setting('app.tenant_id') as tenant`);
        return { actorId, tenantId, membershipId, role, settings };
      });
      expect(context).toEqual({ actorId: a, tenantId: tenantA, membershipId: membershipA, role: "OWNER",
        settings: { actor: a, tenant: tenantA } });
      await expect(boundary.withTenantContext(tenantB, async () => "must not run")).rejects.toThrow("Workspace access denied.");
    });
  });
  it("denies foreign, nonexistent, malformed, revoked and absent actor without entering the callback", async () => {
    await withTenancyFixture(database, async ({ a, tenantA, tenantB, membershipA }) => {
      const boundary = await boundaryFor(a);
      let calls = 0;
      const operation = async () => { calls++; };
      for (const tenant of [tenantB, "00000000-0000-4000-8000-000000000000", "invalid"]) {
        await expect(boundary.withTenantContext(tenant, operation)).rejects.toThrow("Workspace access denied.");
      }
      await database.admin`update public.memberships set status = 'REVOKED', revoked_at = now() where id = ${membershipA}`;
      await expect(boundary.withTenantContext(tenantA, operation)).rejects.toThrow("Workspace access denied.");
      const anonymous = createTenantBoundary(database.db, async () => null);
      await expect(anonymous.withTenantContext(tenantA, operation)).rejects.toThrow("Authentication required.");
      expect(calls).toBe(0);
    });
  });
  it("cannot promote an OPERATOR through a forged OWNER hint", async () => {
    await withTenancyFixture(database, async ({ operator, tenantA }) => {
      const boundary = await boundaryFor(operator, { "x-role": "OWNER" });
      expect(await boundary.withTenantContext(tenantA, async ({ role }) => role)).toBe("OPERATOR");
    });
  });
  it.each(["commit", "rollback"])("clears both GUCs on %s before the same physical connection serves another actor", async (outcome) => {
    await withTenancyFixture(database, async ({ a, b, tenantA, tenantB }) => {
      const first = await boundaryFor(a), second = await boundaryFor(b);
      let pid = 0;
      const operation = first.withTenantContext(tenantA, async ({ tx }) => {
        const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        pid = row.pid;
        await tx.execute(sql`update public.tenants set name = 'Transaction change' where id = ${tenantA}`);
        if (outcome === "rollback") throw new Error("Requested rollback.");
      });
      if (outcome === "rollback") await expect(operation).rejects.toThrow("Requested rollback."); else await operation;
      const [empty] = await database.client`select pg_backend_pid() as pid,
        nullif(current_setting('app.actor_id', true), '') as actor, nullif(current_setting('app.tenant_id', true), '') as tenant`;
      expect(empty).toEqual({ pid, actor: null, tenant: null });
      expect(await database.client`select id from public.tenants`).toEqual([]);
      expect(await database.client`update public.tenants set name = 'Leak' where id = ${tenantA} returning id`).toEqual([]);
      await second.withTenantContext(tenantB, async ({ tx }) => {
        const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        expect(row.pid).toBe(pid);
        expect((await tx.execute(sql`select id from public.tenants`)).map((value) => value.id)).toEqual([tenantB]);
        expect(await tx.execute(sql`select id from public.tenants where id = ${tenantA}`)).toEqual([]);
      });
      const [stored] = await database.admin`select name from public.tenants where id = ${tenantA}`;
      expect(stored.name).toBe(outcome === "rollback" ? "Workspace A" : "Transaction change");
    });
  });
  it("rechecks revoked and expired database sessions", async () => {
    await withTenancyFixture(database, async ({ a, tenantA }) => {
      const revoked = await boundaryFor(a);
      await database.client`delete from public.sessions where user_id = ${a}`;
      await expect(revoked.withTenantContext(tenantA, async () => 1)).rejects.toThrow("Authentication required.");
      const expired = await boundaryFor(a);
      await database.client`update public.sessions set expires_at = now() - interval '1 second' where user_id = ${a}`;
      await expect(expired.withTenantContext(tenantA, async () => 1)).rejects.toThrow("Authentication required.");
    });
  });
});
