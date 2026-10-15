import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createAuthentication } from "../src/platform/auth/factory";
import { createTenantBoundary } from "../src/platform/db/tenant-context";
import { createWorkspaceService } from "../src/modules/identity/application/workspaces";
import { openTenancyDatabase, rollbackProbe, withTenancyFixture } from "./helpers/tenancy-fixtures";

const database = openTenancyDatabase();
const secret = "Synthetic-workspace-bootstrap-secret.0123456789!";
const auth = createAuthentication(database.db, { secret, baseURL: "http://localhost:3000" });
const context = await auth.$context;
afterAll(() => database.close());
async function actorBoundary(actor: string) {
  const session = await context.internalAdapter.createSession(actor);
  const token = `${session.token}.${await makeSignature(session.token, secret)}`;
  const headers = new Headers({ cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(token)}` });
  return createTenantBoundary(database.db, async () => (await auth.api.getSession({ headers }))?.user ?? null);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("restricted first-workspace bootstrap", () => {
  it("creates one Tenant and ACTIVE OWNER Membership with server actor attribution", async () => {
    await withTenancyFixture(database, async ({ fresh }) => {
      const service = createWorkspaceService(await actorBoundary(fresh));
      const workspace = await service.createFirstWorkspace("  신규 조직  ");
      expect(workspace.name).toBe("신규 조직"); expect(workspace.role).toBe("OWNER");
      expect(await service.listWorkspaces()).toEqual([workspace]);
      const [membership] = await database.admin`select user_id, role, status, created_by_user_id from public.memberships
        where tenant_id = ${workspace.id}`;
      expect(membership).toEqual({ user_id: fresh, role: "OWNER", status: "ACTIVE", created_by_user_id: fresh });
      await expect(service.createFirstWorkspace("Duplicate")).rejects.toThrow("Workspace creation denied.");
      expect(await database.admin`select id from public.tenants where created_by_user_id = ${fresh}`).toHaveLength(1);
    });
  });
  it("rolls both inserts back if the caller transaction fails after bootstrap", async () => {
    await withTenancyFixture(database, async ({ fresh }) => {
      const boundary = await actorBoundary(fresh);
      await expect(boundary.withAuthenticatedActor(async ({ tx }) => {
        const [row] = await tx.execute<{ id: string }>(sql`select public.create_first_workspace('Rollback workspace') as id`);
        expect(await tx.execute(sql`select id from public.tenants where id = ${row.id}`)).toHaveLength(1);
        throw new Error("Caller failed.");
      })).rejects.toThrow("Caller failed.");
      expect(await database.admin`select id from public.tenants where created_by_user_id = ${fresh}`).toEqual([]);
      expect(await database.admin`select id from public.memberships where user_id = ${fresh}`).toEqual([]);
    });
  });
  it("has only one success for parallel bootstrap requests from the same actor", async () => {
    await withTenancyFixture(database, async ({ fresh }) => {
      const first = createWorkspaceService(await actorBoundary(fresh));
      const second = createWorkspaceService(await actorBoundary(fresh));
      const outcomes = await Promise.allSettled([first.createFirstWorkspace("First"), second.createFirstWorkspace("Second")]);
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(await database.admin`select id from public.tenants where created_by_user_id = ${fresh}`).toHaveLength(1);
      expect(await database.admin`select id from public.memberships where user_id = ${fresh} and status = 'ACTIVE'`).toHaveLength(1);
    });
  });
  it("serializes two distinct backends on the actor advisory lock and rechecks after commit", async () => {
    await withTenancyFixture(database, async ({ fresh }) => {
      const firstBoundary = await actorBoundary(fresh), secondBoundary = await actorBoundary(fresh);
      const entered = deferred(), release = deferred(), secondReady = deferred();
      let firstPid = 0, secondPid = 0;
      const first = firstBoundary.withAuthenticatedActor(async ({ tx }) => {
        const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        firstPid = backend.pid;
        const [workspace] = await tx.execute<{ id: string }>(sql`select public.create_first_workspace('Held first workspace') as id`);
        entered.resolve(); await release.promise;
        return workspace.id;
      });
      let second: Promise<unknown> | undefined;
      try {
        await Promise.race([entered.promise, first]);
        second = secondBoundary.withAuthenticatedActor(async ({ tx }) => {
          const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
          secondPid = backend.pid; secondReady.resolve();
          await tx.execute(sql`select public.create_first_workspace('Blocked duplicate')`);
          throw new Error("Always rollback unexpected successful duplicate bootstrap.");
        }).catch((error: unknown) => error);
        await Promise.race([secondReady.promise, second]);
        expect(secondPid).not.toBe(firstPid);
        const deadline = Date.now() + 2_000;
        let blocked = false;
        while (Date.now() < deadline) {
          const [row] = await database.admin`select wait_event_type, wait_event, pg_blocking_pids(pid) as blockers
            from pg_stat_activity where pid = ${secondPid}`;
          if (row?.wait_event_type === "Lock" && row.wait_event === "advisory" && row.blockers.includes(firstPid)) {
            blocked = true; break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(blocked).toBe(true);
        release.resolve();
        const id = await first;
        const denied = await second;
        expect(denied instanceof Error && "cause" in denied ? denied.cause : denied).toMatchObject({ code: "42501" });
        expect(await database.admin`select id from public.tenants where created_by_user_id = ${fresh}`).toEqual([{ id }]);
        expect(await database.admin`select tenant_id, role, status from public.memberships where user_id = ${fresh}`)
          .toEqual([{ tenant_id: id, role: "OWNER", status: "ACTIVE" }]);
      } finally { release.resolve(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
    });
  });
  it("permits bootstrap after only REVOKED history, without overwriting the old membership", async () => {
    await withTenancyFixture(database, async ({ a, tenantA, membershipA }) => {
      await database.admin`update public.memberships set status = 'REVOKED', revoked_at = now() where id = ${membershipA}`;
      const service = createWorkspaceService(await actorBoundary(a));
      const workspace = await service.createFirstWorkspace("Replacement workspace");
      expect(workspace.id).not.toBe(tenantA);
      expect(await service.listWorkspaces()).toEqual([workspace]);
      expect((await database.admin`select status from public.memberships where id = ${membershipA}`)[0].status).toBe("REVOKED");
    });
  });
  it("denies missing/malformed actors, invalid names and repeatable-read isolation without writes", async () => {
    await withTenancyFixture(database, async ({ fresh }) => {
      await expect(rollbackProbe(database.client, async (tx) => {
        await tx`select public.create_first_workspace('No actor')`;
      })).rejects.toMatchObject({ code: "42501" });
      await expect(rollbackProbe(database.client, async (tx) => {
        await tx`select set_config('app.actor_id', 'invalid', true)`;
        await tx`select public.create_first_workspace('Bad actor')`;
      })).rejects.toMatchObject({ code: "22P02" });
      for (const name of [null, "   ", "한".repeat(81)]) {
        await expect(rollbackProbe(database.client, async (tx) => {
          await tx`select set_config('app.actor_id', ${fresh}, true)`;
          await tx`select public.create_first_workspace(${name})`;
        })).rejects.toMatchObject({ code: "22023" });
      }
      await expect(database.client.begin("isolation level repeatable read", async (tx) => {
        await tx`select set_config('app.actor_id', ${fresh}, true)`;
        await tx`select public.create_first_workspace('Stale snapshot')`;
        throw new Error("Always rollback unexpected successful bootstrap.");
      })).rejects.toMatchObject({ code: "22023" });
      expect(await database.admin`select id from public.tenants where created_by_user_id = ${fresh}`).toEqual([]);
    });
  });
  it("keeps narrow application role checks for OWNER rename and ACTIVE discovery", async () => {
    await withTenancyFixture(database, async ({ a, b, operator, reviewer, tenantA, tenantB }) => {
      const owner = createWorkspaceService(await actorBoundary(a));
      expect(await owner.renameWorkspace(tenantA, "Owner rename")).toEqual({ id: tenantA, name: "Owner rename", role: "OWNER" });
      await expect(owner.renameWorkspace(tenantB, "Foreign rename")).rejects.toThrow("Workspace access denied.");
      for (const actor of [operator, reviewer]) {
        const service = createWorkspaceService(await actorBoundary(actor));
        expect((await service.listWorkspaces()).map((workspace) => workspace.id)).toEqual([tenantA]);
        await expect(service.renameWorkspace(tenantA, "Wrong role")).rejects.toThrow("Workspace access denied.");
      }
      expect((await createWorkspaceService(await actorBoundary(b)).listWorkspaces()).map((workspace) => workspace.id)).toEqual([tenantB]);
    });
  });
  it("keeps helper non-login/non-bypass, separate ownership, fixed search_path and PUBLIC EXECUTE revoked", async () => {
    const [helper] = await database.owner`select rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
      rolreplication, rolinherit, has_schema_privilege(oid, 'public', 'CREATE') as schema_create
      from pg_roles where rolname = 'seller_shield_bootstrap'`;
    expect(Object.values(helper)).toEqual([false, false, false, false, false, false, false, false]);
    const functions = await database.owner`select p.proname, p.prosecdef, p.proconfig, r.rolname,
      exists(select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner
      where n.nspname = 'public' and p.prosecdef`;
    expect(functions).toEqual([{ proname: "create_first_workspace", prosecdef: true,
      proconfig: ["search_path=pg_catalog, pg_temp", "row_security=on"], rolname: "seller_shield_bootstrap", public_execute: false }]);
    const [privileges] = await database.owner`select
      has_any_column_privilege('seller_shield_bootstrap', 'public.tenants', 'SELECT') as tenant_select,
      has_column_privilege('seller_shield_bootstrap', 'public.memberships', 'id', 'SELECT') as member_id_select,
      pg_has_role(current_user, 'seller_shield_bootstrap', 'MEMBER') as migration_member`;
    expect(privileges).toEqual({ tenant_select: false, member_id_select: false, migration_member: false });
    await expect(rollbackProbe(database.client, async (tx) => { await tx`set local role seller_shield_bootstrap`; }))
      .rejects.toMatchObject({ code: "42501" });
  });
});
