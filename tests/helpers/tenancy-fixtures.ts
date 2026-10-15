import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createDatabaseConnection } from "../../src/platform/db/connection.ts";
import { requireAuthGrantConfiguration } from "../../src/platform/db/auth-grants.ts";
import { loadDatabaseTestEnvironment } from "./database-test-environment.ts";

export function openTenancyDatabase(maxConnections = 4) {
  loadDatabaseTestEnvironment();
  const { runtimeUrl, migrationUrl } = requireAuthGrantConfiguration(process.env);
  const adminUrl = process.env.DATABASE_TEST_ADMIN_URL;
  if (!adminUrl) throw new Error("Explicit test administrator is required.");
  const roles = [runtimeUrl, migrationUrl, adminUrl].map((url) => new URL(url).username);
  if (new Set(roles).size !== 3) throw new Error("Three distinct test database roles are required.");
  const runtime = createDatabaseConnection(runtimeUrl, { maxConnections });
  const admin = postgres(adminUrl, { max: 3 });
  const owner = postgres(migrationUrl, { max: 1 });
  return { ...runtime, admin, owner, async close() {
    await Promise.all([runtime.client.end({ timeout: 5 }), admin.end({ timeout: 5 }), owner.end({ timeout: 5 })]);
  } };
}

export type TenancyTestDatabase = ReturnType<typeof openTenancyDatabase>;

export async function withTenancyFixture<T>(database: TenancyTestDatabase,
  operation: (fixture: { a: string; b: string; operator: string; reviewer: string;
    fresh: string; tenantA: string; tenantB: string; membershipA: string }) => Promise<T>): Promise<T> {
  const fixture = { a: randomUUID(), b: randomUUID(), operator: randomUUID(), reviewer: randomUUID(),
    fresh: randomUUID(), tenantA: randomUUID(), tenantB: randomUUID(), membershipA: randomUUID() };
  const users = [fixture.a, fixture.b, fixture.operator, fixture.reviewer, fixture.fresh];
  await database.admin.begin(async (tx) => {
    for (const id of users) await tx`insert into public.users (id, name, email, email_verified)
      values (${id}, 'Synthetic authorization fixture', ${`slice-1c2-${id}@example.test`}, true)`;
    await tx`insert into public.tenants (id, name, created_by_user_id)
      values (${fixture.tenantA}, 'Workspace A', ${fixture.a}), (${fixture.tenantB}, 'Workspace B', ${fixture.b})`;
    await tx`insert into public.memberships (id, tenant_id, user_id, role, status, created_by_user_id)
      values (${fixture.membershipA}, ${fixture.tenantA}, ${fixture.a}, 'OWNER', 'ACTIVE', ${fixture.a}),
      (${randomUUID()}, ${fixture.tenantB}, ${fixture.b}, 'OWNER', 'ACTIVE', ${fixture.b}),
      (${randomUUID()}, ${fixture.tenantA}, ${fixture.operator}, 'OPERATOR', 'ACTIVE', ${fixture.a}),
      (${randomUUID()}, ${fixture.tenantA}, ${fixture.reviewer}, 'REVIEWER', 'ACTIVE', ${fixture.a})`;
  });
  try { return await operation(fixture); }
  finally {
    await database.admin.begin(async (tx) => {
      // Includes bootstrap-created workspaces, but only this run's random actors.
      const created = await tx`select id from public.tenants where created_by_user_id in ${tx(users)}`;
      const tenants = created.map((row) => row.id as string);
      if (tenants.length) {
        await tx`delete from public.memberships where tenant_id in ${tx(tenants)}`;
        await tx`delete from public.tenants where id in ${tx(tenants)}`;
      }
      await tx`delete from public.users where id in ${tx(users)}`;
    });
  }
}

export async function rollbackProbe<T>(client: postgres.Sql,
  operation: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  const rollback = new Error("Rollback successful probe.");
  let result!: T;
  try { await client.begin(async (tx) => { result = await operation(tx); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; }
  return result;
}
