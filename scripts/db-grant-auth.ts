import { requireAuthGrantConfiguration } from "../src/platform/db/auth-grants.ts";
import { createDatabaseConnection } from "../src/platform/db/connection.ts";
import { loadDatabaseEnvironment } from "../src/platform/db/local-env.ts";

loadDatabaseEnvironment();

async function main() {
  const { migrationUrl, runtimeRole } = requireAuthGrantConfiguration(process.env);
  const { client } = createDatabaseConnection(migrationUrl, { maxConnections: 1 });
  try {
    await client.begin(async (tx) => {
      const [role] = await tx`select r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
        pg_has_role(r.oid, current_user, 'MEMBER') as owner_member,
        has_database_privilege(r.oid, current_database(), 'CREATE') as db_create,
        has_schema_privilege(r.oid, 'public', 'CREATE') as schema_create
        from pg_roles r where r.rolname = ${runtimeRole}`;
      if (!role || Object.values(role).some(Boolean)) throw new Error("Unsafe runtime role.");
      const tables = await tx`select c.relname, c.relowner = (select oid from pg_roles where rolname = current_user) as migration_owner
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('users','accounts','sessions','verifications')`;
      if (tables.length !== 4 || tables.some((table) => !table.migration_owner)) throw new Error("Migrate the four auth tables with the owner role first.");
      // Role name is escaped as an SQL identifier. No ALL TABLES/default privileges.
      await tx`grant select, insert, update, delete on table public.users, public.accounts, public.sessions, public.verifications to ${tx(runtimeRole)}`;
    });
    console.log("Authentication runtime CRUD grants applied to four tables.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch(() => {
  console.error("Authentication grants failed. Verify separate role URLs, privileges, and applied migrations; details redacted.");
  process.exitCode = 1;
});
