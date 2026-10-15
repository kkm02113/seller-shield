import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createAuthentication } from "../src/platform/auth/factory";
import { createTenantBoundary } from "../src/platform/db/tenant-context";
import { createWorkspaceService } from "../src/modules/identity/application/workspaces";
import { openTenancyDatabase, withTenancyFixture } from "./helpers/tenancy-fixtures";

const database = openTenancyDatabase();
const secret = "Synthetic-tenant-concurrency-secret.0123456789!";
const auth = createAuthentication(database.db, { secret, baseURL: "http://localhost:3000" });
const context = await auth.$context;
afterAll(() => database.close());
async function boundaryFor(actor: string) {
  const session = await context.internalAdapter.createSession(actor);
  const signed = `${session.token}.${await makeSignature(session.token, secret)}`;
  const headers = new Headers({ cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(signed)}` });
  return createTenantBoundary(database.db, async () => (await auth.api.getSession({ headers }))?.user ?? null);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("tenancy concurrent authorization", () => {
  it("holds Membership FOR SHARE until the operation ends, then rejects the revoked membership", async () => {
    await withTenancyFixture(database, async ({ a, tenantA, membershipA }) => {
      const boundary = await boundaryFor(a);
      const entered = deferred(), release = deferred(), revokerReady = deferred();
      let actorPid = 0, revokerPid = 0;
      const operation = boundary.withTenantContext(tenantA, async ({ tx }) => {
        const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        actorPid = row.pid; entered.resolve();
        await release.promise;
        return tx.execute(sql`update public.tenants set name = 'Locked owner operation' where id = ${tenantA} returning id`);
      });
      await entered.promise;
      const revocation = database.admin.begin(async (tx) => {
        [ { pid: revokerPid } ] = await tx`select pg_backend_pid() as pid`;
        revokerReady.resolve();
        await tx`update public.memberships set status = 'REVOKED', revoked_at = now() where id = ${membershipA}`;
      });
      try {
        await revokerReady.promise;
        const deadline = Date.now() + 2_000;
        let blocked = false;
        while (Date.now() < deadline) {
          const [row] = await database.admin`select wait_event_type, pg_blocking_pids(pid) as blockers
            from pg_stat_activity where pid = ${revokerPid}`;
          if (row?.wait_event_type === "Lock" && row.blockers.includes(actorPid)) { blocked = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(blocked).toBe(true);
        release.resolve();
        expect(await operation).toEqual([{ id: tenantA }]);
        await revocation;
        await expect(boundary.withTenantContext(tenantA, async () => 1)).rejects.toThrow("Workspace access denied.");
      } finally { release.resolve(); await Promise.allSettled([operation, revocation]); }
    });
  });
  it("allows different actors to bootstrap independently", async () => {
    await withTenancyFixture(database, async ({ fresh, b }) => {
      await database.admin`update public.memberships set status = 'REVOKED', revoked_at = now() where user_id = ${b}`;
      const first = createWorkspaceService(await boundaryFor(fresh));
      const second = createWorkspaceService(await boundaryFor(b));
      const workspaces = await Promise.all([first.createFirstWorkspace("Independent A"), second.createFirstWorkspace("Independent B")]);
      expect(workspaces[0].id).not.toBe(workspaces[1].id);
      expect(await first.listWorkspaces()).toEqual([workspaces[0]]);
      expect(await second.listWorkspaces()).toEqual([workspaces[1]]);
    });
  });
  it("rechecks ACTIVE status when authorization waits behind a revocation already in flight", async () => {
    await withTenancyFixture(database, async ({ a, tenantA, membershipA }) => {
      const boundary = await boundaryFor(a);
      const changed = deferred(), release = deferred();
      let revokerPid = 0, called = false;
      const revocation = database.admin.begin(async (tx) => {
        [ { pid: revokerPid } ] = await tx`select pg_backend_pid() as pid`;
        await tx`update public.memberships set status = 'REVOKED', revoked_at = now() where id = ${membershipA}`;
        changed.resolve(); await release.promise;
      });
      await changed.promise;
      const operation = boundary.withTenantContext(tenantA, async () => { called = true; });
      const denied = expect(operation).rejects.toThrow("Workspace access denied.");
      try {
        const deadline = Date.now() + 2_000;
        let blocked = false;
        while (Date.now() < deadline) {
          const rows = await database.admin`select pid from pg_stat_activity
            where wait_event_type = 'Lock' and ${revokerPid} = any(pg_blocking_pids(pid))`;
          if (rows.length) { blocked = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(blocked).toBe(true);
        release.resolve(); await revocation; await denied;
        expect(called).toBe(false);
      } finally { release.resolve(); await Promise.allSettled([revocation, operation, denied]); }
    });
  });
  it("a global DB query cannot inherit the callback transaction's actor/tenant", async () => {
    await withTenancyFixture(database, async ({ a, tenantA }) => {
      const boundary = await boundaryFor(a);
      await boundary.withTenantContext(tenantA, async ({ tx }) => {
        const [scoped] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        const [global] = await database.db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        expect(global.pid).not.toBe(scoped.pid);
        expect(await database.db.execute(sql`select id from public.tenants`)).toEqual([]);
        expect(await tx.execute(sql`select id from public.tenants where id = ${tenantA}`)).toEqual([{ id: tenantA }]);
      });
    });
  });
});
