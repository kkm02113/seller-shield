import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

import { requireDatabaseUrl, requireMigrationDatabaseUrl } from "../src/platform/db/env";
import { loadDatabaseEnvironment } from "../src/platform/db/local-env";

loadDatabaseEnvironment();
const runtimeUrl = requireDatabaseUrl(process.env);
const ownerUrl = requireMigrationDatabaseUrl(process.env);
// Explicit test-only existing admin boundary: never fall back to runtime/owner
// credentials, add a bypass role, disable RLS, or use this from application code.
const adminUrl = process.env.DATABASE_TEST_ADMIN_URL;
if (!adminUrl) throw new Error("DATABASE_TEST_ADMIN_URL is required for tenancy fixtures in a dedicated local/test database.");
try {
  const urls = [runtimeUrl, ownerUrl, adminUrl].map((value) => new URL(value));
  if (urls.some((url) => !["postgres:", "postgresql:"].includes(url.protocol)
    || url.hostname !== urls[0].hostname || (url.port || "5432") !== (urls[0].port || "5432")
    || url.pathname !== urls[0].pathname)
    || new Set(urls.map((url) => decodeURIComponent(url.username))).size !== 3) throw new Error();
} catch {
  throw new Error("Tenancy fixture URLs require three distinct roles on the same PostgreSQL database; details redacted.");
}
const runtime = postgres(runtimeUrl, { max: 1 });
const owner = postgres(ownerUrl, { max: 1 });
const admin = postgres(adminUrl, { max: 1 });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeAll(async () => {
  const [role] = await admin`select rolsuper from pg_roles where rolname = current_user`;
  if (!role?.rolsuper) throw new Error("Use the existing test/setup administrator for fixtures; do not broaden production privileges.");
});
afterAll(() => Promise.all([runtime.end({ timeout: 5 }), owner.end({ timeout: 5 }), admin.end({ timeout: 5 })]));

type Fixture = { tenant: string; member: string; creator: string; user: string; memberCreator: string };
async function withFixture(check: (fixture: Fixture) => Promise<void>) {
  const fixture = { tenant: randomUUID(), member: randomUUID(), creator: randomUUID(), user: randomUUID(), memberCreator: randomUUID() };
  await admin.begin(async (tx) => {
    for (const id of [fixture.creator, fixture.user, fixture.memberCreator]) {
      await tx`insert into public.users (id, name, email) values (${id}, 'Synthetic tenancy fixture', ${`slice-1c-${id}@example.test`})`;
    }
    await tx`insert into public.tenants (id, name, created_by_user_id) values (${fixture.tenant}, '테스트 워크스페이스', ${fixture.creator})`;
    await tx`insert into public.memberships (id, tenant_id, user_id, role, status, created_by_user_id)
      values (${fixture.member}, ${fixture.tenant}, ${fixture.user}, 'OWNER', 'ACTIVE', ${fixture.memberCreator})`;
  });
  try {
    // Committed synthetic rows make owner/runtime visibility assertions non-vacuous.
    await check(fixture);
  } finally {
    await admin.begin(async (tx) => {
      // Only this run's synthetic tenant/users; no reset, TRUNCATE or RLS changes.
      await tx`delete from public.memberships where tenant_id = ${fixture.tenant}`;
      await tx`delete from public.tenants where id = ${fixture.tenant}`;
      await tx`delete from public.users where id in (${fixture.creator}, ${fixture.user}, ${fixture.memberCreator})`;
    });
  }
}

async function rejectsCode(operation: Promise<unknown>, code: string) {
  await expect(operation).rejects.toMatchObject({ code });
}

async function rejectsWrite(client: postgres.Sql, operation: (tx: postgres.TransactionSql) => Promise<unknown>, code = "42501") {
  await rejectsCode(client.begin(async (tx) => {
    await operation(tx);
    // Never leave a write behind even if a misconfigured role unexpectedly permits it.
    throw new Error("Write unexpectedly allowed; rolled back.");
  }), code);
}

describe("Tenant/Membership ↔ real PostgreSQL persistence", () => {
  it("adds exactly two tenancy tables without other product tables", async () => {
    const tables = await owner`select tablename from pg_tables where schemaname = 'public' order by tablename`;
    expect(tables.map((table) => table.tablename)).toEqual([
      "accounts", "memberships", "rate_limits", "sessions", "tenants", "users", "verifications",
    ]);
  });

  it("enables and forces RLS with zero policies on both tables", async () => {
    const tables = await owner`select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('tenants', 'memberships') order by c.relname`;
    expect(tables).toEqual([
      { relname: "memberships", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "tenants", relrowsecurity: true, relforcerowsecurity: true },
    ]);
    expect(await owner`select policyname from pg_policies where schemaname = 'public'`).toEqual([]);
  });

  it("has exact columns, defaults, UUIDs, timestamptz, and the approved role enum", async () => {
    const columns = await owner`select table_name, column_name, udt_name, is_nullable, column_default
      from information_schema.columns where table_schema = 'public' and table_name in ('tenants','memberships')
      order by table_name, ordinal_position`;
    expect(columns.map((column) => [column.table_name, column.column_name, column.udt_name, column.is_nullable])).toEqual([
      ["memberships", "id", "uuid", "NO"], ["memberships", "tenant_id", "uuid", "NO"],
      ["memberships", "user_id", "uuid", "NO"], ["memberships", "role", "membership_role", "NO"],
      ["memberships", "status", "text", "NO"], ["memberships", "joined_at", "timestamptz", "NO"],
      ["memberships", "revoked_at", "timestamptz", "YES"], ["memberships", "created_by_user_id", "uuid", "YES"],
      ["tenants", "id", "uuid", "NO"], ["tenants", "name", "text", "NO"],
      ["tenants", "created_by_user_id", "uuid", "NO"], ["tenants", "created_at", "timestamptz", "NO"],
      ["tenants", "updated_at", "timestamptz", "NO"],
    ]);
    expect(columns.filter((column) => column.column_name === "id").map((column) => column.column_default))
      .toEqual(["gen_random_uuid()", "gen_random_uuid()"]);
    expect(columns.filter((column) => ["created_at", "updated_at", "joined_at"].includes(column.column_name))
      .every((column) => column.column_default === "now()")).toBe(true);
    const roles = await owner`select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'membership_role' order by e.enumsortorder`;
    expect(roles.map((role) => role.enumlabel)).toEqual(["OWNER", "OPERATOR", "REVIEWER"]);
  });

  it("has the exact relational constraints and approved discovery/administration indexes", async () => {
    const constraints = await owner`select c.relname, con.conname, con.contype, con.confdeltype,
      pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('tenants','memberships')`;
    expect(constraints.filter((constraint) => constraint.contype === "f").map((constraint) => constraint.definition).sort()).toEqual([
      "FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT",
      "FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT",
      "FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT",
      "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT",
    ]);
    expect(constraints.filter((constraint) => constraint.contype === "u").map((constraint) => constraint.definition))
      .toEqual(["UNIQUE (tenant_id, user_id)"]);
    expect(constraints.filter((constraint) => constraint.contype === "c").map((constraint) => constraint.conname).sort())
      .toEqual(["memberships_revocation_check", "memberships_status_check", "tenants_name_check"]);
    const indexes = await owner`select indexname, indexdef from pg_indexes
      where schemaname = 'public' and tablename in ('tenants','memberships') order by indexname`;
    expect(indexes.map((index) => index.indexname)).toEqual([
      "memberships_pkey", "memberships_tenant_status_role_idx", "memberships_tenant_user_unique",
      "memberships_user_status_tenant_idx", "tenants_pkey",
    ]);
    expect(indexes.find((index) => index.indexname === "memberships_user_status_tenant_idx")?.indexdef)
      .toContain("(user_id, status, tenant_id)");
    expect(indexes.find((index) => index.indexname === "memberships_tenant_status_role_idx")?.indexdef)
      .toContain("(tenant_id, status, role)");
  });

  it("generates UUIDv4 and accepts each role, revoked state and nullable creator", async () => {
    await withFixture(async (fixture) => {
      await admin.begin(async (tx) => {
        // Roll back successful probes too; fixture cleanup remains bounded.
        const rollback = new Error("Rollback successful generated-ID probe.");
        try {
          await tx.savepoint(async (probe) => {
            const [tenant] = await probe`insert into public.tenants (name, created_by_user_id)
              values (${"한".repeat(80)}, ${fixture.creator}) returning id, created_at, updated_at`;
            expect(tenant.id).toMatch(uuid);
            expect(tenant.created_at).toBeInstanceOf(Date);
            expect(tenant.updated_at).toBeInstanceOf(Date);
            for (const role of ["OWNER", "OPERATOR", "REVIEWER"]) {
              const [member] = await probe`insert into public.memberships (tenant_id, user_id, role, status, revoked_at)
                values (${tenant.id}, ${fixture.user}, ${role}, 'REVOKED', now()) returning id, created_by_user_id, joined_at`;
              expect(member.id).toMatch(uuid);
              expect(member.created_by_user_id).toBeNull();
              expect(member.joined_at).toBeInstanceOf(Date);
              await probe`delete from public.memberships where id = ${member.id}`;
            }
            throw rollback;
          });
        } catch (error) { if (error !== rollback) throw error; }
      });
    });
  });

  it("rejects duplicate membership and invalid tenant/user/creator foreign keys", async () => {
    await withFixture(async (fixture) => {
      await rejectsWrite(admin, async (tx) => tx`insert into public.memberships (tenant_id, user_id, role, status)
        values (${fixture.tenant}, ${fixture.user}, 'OWNER', 'ACTIVE')`, "23505");
      await rejectsWrite(admin, async (tx) => tx`insert into public.memberships (tenant_id, user_id, role, status)
        values (${randomUUID()}, ${fixture.creator}, 'OPERATOR', 'ACTIVE')`, "23503");
      await rejectsWrite(admin, async (tx) => tx`insert into public.memberships (tenant_id, user_id, role, status)
        values (${fixture.tenant}, ${randomUUID()}, 'REVIEWER', 'ACTIVE')`, "23503");
      await rejectsWrite(admin, async (tx) => tx`insert into public.memberships (tenant_id, user_id, role, status, created_by_user_id)
        values (${fixture.tenant}, ${fixture.creator}, 'OWNER', 'ACTIVE', ${randomUUID()})`, "23503");
      await rejectsWrite(admin, async (tx) => tx`insert into public.tenants (name, created_by_user_id)
        values ('Invalid creator', ${randomUUID()})`, "23503");
    });
  });

  it("rejects invalid roles/statuses and inconsistent ACTIVE/REVOKED timestamps", async () => {
    await withFixture(async (fixture) => {
      await rejectsWrite(admin, async (tx) => tx`update public.memberships set role = 'ADMIN' where id = ${fixture.member}`, "22P02");
      await rejectsWrite(admin, async (tx) => tx`update public.memberships set status = 'PENDING' where id = ${fixture.member}`, "23514");
      await rejectsWrite(admin, async (tx) => tx`update public.memberships set revoked_at = now() where id = ${fixture.member}`, "23514");
      await rejectsWrite(admin, async (tx) => tx`update public.memberships set status = 'REVOKED' where id = ${fixture.member}`, "23514");
    });
  });

  it("rolls back a negative constraint probe even when the statement unexpectedly succeeds", async () => {
    await withFixture(async (fixture) => {
      const probeId = randomUUID();
      // Deliberately valid SQL simulates a missing constraint without disabling
      // RLS or changing schema. The helper must fail AND undo this successful write.
      await expect(rejectsWrite(admin, async (tx) => tx`insert into public.memberships (id, tenant_id, user_id, role, status)
        values (${probeId}, ${fixture.tenant}, ${fixture.creator}, 'OWNER', 'ACTIVE')`, "23503"))
        .rejects.toThrow();
      expect(await admin`select id from public.memberships where id = ${probeId}`).toEqual([]);
    });
  });

  it("enforces non-empty trimmed 1..80-character workspace names without global uniqueness", async () => {
    await withFixture(async (fixture) => {
      for (const name of ["", " ", " leading", "trailing ", "한".repeat(81)]) {
        await rejectsWrite(admin, async (tx) => tx`update public.tenants set name = ${name} where id = ${fixture.tenant}`, "23514");
      }
      // Same name, different UUID is permitted; this write is rolled back.
      const rollback = new Error("Rollback duplicate-name probe.");
      try {
        await admin.begin(async (tx) => {
          expect(await tx`insert into public.tenants (name, created_by_user_id)
            values ('테스트 워크스페이스', ${fixture.creator}) returning id`).toHaveLength(1);
          throw rollback;
        });
      } catch (error) { if (error !== rollback) throw error; }
    });
  });

  it("RESTRICTs Tenant and every referenced User deletion without cascading membership", async () => {
    await withFixture(async (fixture) => {
      // PostgreSQL 18 reports RESTRICT deletion as 23001, not missing-parent 23503.
      await rejectsWrite(admin, async (tx) => tx`delete from public.tenants where id = ${fixture.tenant}`, "23001");
      for (const id of [fixture.creator, fixture.user, fixture.memberCreator]) {
        await rejectsWrite(admin, async (tx) => tx`delete from public.users where id = ${id}`, "23001");
      }
      expect(await admin`select id from public.memberships where id = ${fixture.member}`).toHaveLength(1);
      expect(await admin`select id from public.tenants where id = ${fixture.tenant}`).toHaveLength(1);
    });
  });

  it("keeps runtime non-owner, unprivileged on tenancy and unable to change roles", async () => {
    const [role] = await runtime`select r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
      has_database_privilege(current_user, current_database(), 'CREATE') as db_create,
      has_schema_privilege(current_user, 'public', 'CREATE') as schema_create from pg_roles r where rolname = current_user`;
    expect(Object.values(role)).toEqual([false, false, false, false, false, false, false]);
    const tables = await runtime`select c.relname,
      c.relowner = (select oid from pg_roles where rolname = current_user) as runtime_owner,
      pg_has_role(current_user, c.relowner, 'MEMBER') as owner_member,
      has_table_privilege(current_user, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as any_privilege
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('tenants','memberships') order by c.relname`;
    expect(tables).toEqual([
      { relname: "memberships", runtime_owner: false, owner_member: false, any_privilege: false },
      { relname: "tenants", runtime_owner: false, owner_member: false, any_privilege: false },
    ]);
    await rejectsCode(runtime.begin(async (tx) => {
      await tx`set local role ${tx(decodeURIComponent(new URL(ownerUrl).username))}`;
    }), "42501");
  });

  it("denies actual runtime SELECT/INSERT/UPDATE/DELETE against committed fixtures", async () => {
    await withFixture(async (fixture) => {
      for (const table of ["tenants", "memberships"]) {
        const id = table === "tenants" ? fixture.tenant : fixture.member;
        await rejectsCode(runtime`select id from ${runtime(`public.${table}`)} where id = ${id}`, "42501");
        await rejectsWrite(runtime, async (tx) => tx`update ${tx(`public.${table}`)} set id = id where id = ${id}`);
        await rejectsWrite(runtime, async (tx) => tx`delete from ${tx(`public.${table}`)} where id = ${id}`);
      }
      await rejectsWrite(runtime, async (tx) => tx`insert into public.tenants (name, created_by_user_id) values ('Denied', ${fixture.creator})`);
      await rejectsWrite(runtime, async (tx) => tx`insert into public.memberships (tenant_id, user_id, role, status)
        values (${fixture.tenant}, ${fixture.creator}, 'OWNER', 'ACTIVE')`);
    });
  });

  it("FORCE RLS hides committed rows and denies inserts even for the non-bypass owner", async () => {
    const [role] = await owner`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    const ownership = await owner`select c.relowner = (select oid from pg_roles where rolname = current_user) as owns
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('tenants','memberships')`;
    expect(ownership).toHaveLength(2);
    expect(ownership.every((table) => table.owns)).toBe(true);
    await withFixture(async (fixture) => {
      for (const table of ["tenants", "memberships"]) {
        const id = table === "tenants" ? fixture.tenant : fixture.member;
        expect(await admin`select id from ${admin(`public.${table}`)} where id = ${id}`).toHaveLength(1);
        expect(await owner`select id from ${owner(`public.${table}`)} where id = ${id}`).toEqual([]);
        const rollback = new Error("Rollback owner RLS probes regardless of assertion result.");
        try {
          await owner.begin(async (tx) => {
            expect(await tx`update ${tx(`public.${table}`)} set id = id where id = ${id} returning id`).toEqual([]);
            expect(await tx`delete from ${tx(`public.${table}`)} where id = ${id} returning id`).toEqual([]);
            throw rollback;
          });
        } catch (error) { if (error !== rollback) throw error; }
      }
      await rejectsWrite(owner, async (tx) => tx`insert into public.tenants (name, created_by_user_id) values ('Denied', ${fixture.creator})`);
      await rejectsWrite(owner, async (tx) => tx`insert into public.memberships (tenant_id, user_id, role, status)
        values (${fixture.tenant}, ${fixture.creator}, 'OWNER', 'ACTIVE')`);
      expect(await admin`select id from public.memberships where id = ${fixture.member}`).toHaveLength(1);
    });
  });

  it("has no workspace bootstrap or SECURITY DEFINER functions", async () => {
    expect(await owner`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.prosecdef or p.proname = 'create_first_workspace')`).toEqual([]);
  });
});
