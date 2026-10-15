import postgres from "postgres";
import { loadDatabaseEnvironment } from "../src/platform/db/local-env.ts";
import { BOOTSTRAP_ROLE, requireTenancyProvisionConfiguration } from "../src/platform/db/tenancy-grants.ts";

loadDatabaseEnvironment();

async function main() {
  const mode = process.argv.slice(2);
  if (mode.length !== 1 || !["--prepare", "--finalize"].includes(mode[0])) throw new Error("Select prepare or finalize.");
  const { provisionUrl, migrationRole, runtimeRole } = requireTenancyProvisionConfiguration(process.env);
  const client = postgres(provisionUrl, { max: 1 });
  try {
    await client.begin(async (tx) => {
      const [administrator] = await tx`select rolsuper from pg_roles where rolname = current_user`;
      if (!administrator?.rolsuper) throw new Error("Explicit existing setup administrator required.");
      const [runtime] = await tx`select rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
        pg_has_role(oid, ${migrationRole}, 'MEMBER') as owner_member,
        has_schema_privilege(oid, 'public', 'CREATE') as schema_create
        from pg_roles where rolname = ${runtimeRole}`;
      if (!runtime || Object.values(runtime).some(Boolean)) throw new Error("Unsafe runtime role.");
      if (mode[0] === "--prepare") {
        const [existing] = await tx`select oid from pg_roles where rolname = ${BOOTSTRAP_ROLE}`;
        if (!existing) await tx`create role ${tx(BOOTSTRAP_ROLE)} nologin nosuperuser nobypassrls
          nocreatedb nocreaterole noreplication noinherit`;
      }
      const [helper] = await tx`select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
        rolbypassrls, rolinherit,
        exists(select 1 from pg_auth_members where member = r.oid) as inherits_roles,
        exists(select 1 from pg_auth_members where roleid = r.oid
          and member <> (select oid from pg_roles where rolname = ${migrationRole})) as unapproved_members,
        exists(select 1 from pg_class where relowner = r.oid) as owns_relations,
        exists(select 1 from pg_namespace where nspowner = r.oid) as owns_schema,
        exists(select 1 from pg_database where datdba = r.oid) as owns_database,
        has_schema_privilege(r.oid, 'public', 'CREATE') as schema_create,
        pg_has_role(${runtimeRole}, r.oid, 'MEMBER') as runtime_member
        from pg_roles r where rolname = ${BOOTSTRAP_ROLE}`;
      if (!helper || Object.values(helper).some(Boolean)) throw new Error("Unsafe bootstrap helper role.");
      if (mode[0] === "--prepare") {
        await tx`grant ${tx(BOOTSTRAP_ROLE)} to ${tx(migrationRole)} with inherit false, set true`;
      } else {
        await tx`revoke ${tx(BOOTSTRAP_ROLE)} from ${tx(migrationRole)}`;
      }
    });
    console.log(`Tenancy provisioning ${mode[0].slice(2)} completed. Runtime helper membership is forbidden.`);
  } finally { await client.end({ timeout: 5 }); }
}

main().catch(() => {
  console.error("Tenancy provisioning failed; verify explicit setup credentials and role safety. Details redacted.");
  process.exitCode = 1;
});
