import postgres from "postgres";
import { loadDatabaseEnvironment } from "../src/platform/db/local-env.ts";
import { BOOTSTRAP_ROLE, requireTenancyGrantConfiguration } from "../src/platform/db/tenancy-grants.ts";

loadDatabaseEnvironment();
async function main() {
  const { migrationUrl, runtimeRole } = requireTenancyGrantConfiguration(process.env);
  const client = postgres(migrationUrl, { max: 1 });
  try {
    await client.begin(async (tx) => {
      const [runtime] = await tx`select rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
        pg_has_role(oid, current_user, 'MEMBER') as owner_member,
        pg_has_role(oid, ${BOOTSTRAP_ROLE}, 'MEMBER') as helper_member,
        has_database_privilege(oid, current_database(), 'CREATE') as db_create,
        has_schema_privilege(oid, 'public', 'CREATE') as schema_create
        from pg_roles where rolname = ${runtimeRole}`;
      if (!runtime || Object.values(runtime).some(Boolean)) throw new Error("Unsafe runtime role.");
      const tables = await tx`select relrowsecurity, relforcerowsecurity,
        relowner = (select oid from pg_roles where rolname = current_user) as migration_owner
        from pg_class where oid in ('public.tenants'::regclass, 'public.memberships'::regclass)`;
      if (tables.length !== 2 || tables.some((table) => !table.relrowsecurity || !table.relforcerowsecurity || !table.migration_owner)) {
        throw new Error("Migrate FORCE-RLS tenancy tables first.");
      }
      const [fn] = await tx`select p.prosecdef, r.rolname, r.rolcanlogin, r.rolsuper, r.rolbypassrls,
        pg_has_role(current_user, r.oid, 'MEMBER') as migration_member,
        has_function_privilege(${runtimeRole}, p.oid, 'EXECUTE') as runtime_execute
        from pg_proc p join pg_roles r on r.oid = p.proowner
        where p.oid = 'public.create_first_workspace(text)'::regprocedure`;
      if (!fn?.prosecdef || fn.rolname !== BOOTSTRAP_ROLE || fn.rolcanlogin || fn.rolsuper || fn.rolbypassrls) {
        throw new Error("Unsafe bootstrap function owner.");
      }
      if (!fn.runtime_execute && !fn.migration_member) throw new Error("Prepare temporary helper membership before initial EXECUTE grant.");
      await tx`grant select on public.tenants, public.memberships to ${tx(runtimeRole)}`;
      await tx`grant update (name, updated_at) on public.tenants to ${tx(runtimeRole)}`;
      await tx`grant update (id) on public.memberships to ${tx(runtimeRole)}`;
      if (!fn.runtime_execute) {
        // Function ownership is separate from table ownership. This temporary
        // SET LOCAL is available only to the migrator, never the runtime role.
        await tx`set local role ${tx(BOOTSTRAP_ROLE)}`;
        await tx`grant execute on function public.create_first_workspace(text) to ${tx(runtimeRole)}`;
      }
    });
    console.log("Minimal tenancy runtime grants applied; no membership mutations or helper role access.");
  } finally { await client.end({ timeout: 5 }); }
}
main().catch(() => {
  console.error("Tenancy grants failed; verify migration, helper finalization and role safety. Details redacted.");
  process.exitCode = 1;
});
