import postgres from "postgres";
import { loadDatabaseEnvironment } from "../src/platform/db/local-env.ts";
import { requireCaseGrantConfiguration } from "../src/platform/db/case-grants.ts";
import { BOOTSTRAP_ROLE } from "../src/platform/db/tenancy-grants.ts";

loadDatabaseEnvironment();
async function main() {
  const { migrationUrl, runtimeRole } = requireCaseGrantConfiguration(process.env);
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
        relowner = (select oid from pg_roles where rolname = current_user) as migration_owner,
        has_table_privilege(${runtimeRole}, oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as broad_write
        from pg_class where oid in ('public.cases'::regclass, 'public.claim_snapshots'::regclass, 'public.case_events'::regclass)`;
      if (tables.length !== 3 || tables.some((t) => !t.relrowsecurity || !t.relforcerowsecurity || !t.migration_owner || t.broad_write)) {
        throw new Error("Case tables must be owner-migrated, FORCE RLS, and without broad runtime writes.");
      }
      // Fail closed on pre-existing unexpected column privileges rather than
      // silently leaving a widened deployment apparently 'minimally granted'.
      const columns = await tx`select c.relname, a.attname,
        has_column_privilege(${runtimeRole}, c.oid, a.attnum, 'INSERT') as ins,
        has_column_privilege(${runtimeRole}, c.oid, a.attnum, 'UPDATE') as upd
        from pg_class c join pg_attribute a on a.attrelid = c.oid
        where c.oid in ('public.cases'::regclass, 'public.claim_snapshots'::regclass, 'public.case_events'::regclass)
        and a.attnum > 0 and not a.attisdropped`;
      const normalization = ["title", "marketplace", "external_case_reference", "external_order_reference", "due_at", "last_activity_at", "updated_at"];
      if (columns.some((c) => (c.upd && (c.relname !== "cases" || !normalization.includes(c.attname))) ||
        (c.ins && ((c.relname === "cases" && ["state", "closure_disposition", "logically_deleted_at"].includes(c.attname)) ||
          (c.relname === "case_events" && ["source_job_id", "display_metadata"].includes(c.attname)))))) throw new Error("Unsafe column privileges.");
      await tx`grant select on public.cases, public.claim_snapshots, public.case_events to ${tx(runtimeRole)}`;
      await tx`grant insert (id, tenant_id, title, marketplace, external_case_reference, external_order_reference,
        due_at, last_activity_at, created_by_user_id, created_at, updated_at) on public.cases to ${tx(runtimeRole)}`;
      await tx`grant update (title, marketplace, external_case_reference, external_order_reference, due_at,
        last_activity_at, updated_at) on public.cases to ${tx(runtimeRole)}`;
      await tx`grant insert (id, tenant_id, case_id, revision, source_type, source_label, source_url, external_claim_reference,
        raw_text, raw_payload, content_sha256, captured_at, captured_by_user_id, capture_method, created_at)
        on public.claim_snapshots to ${tx(runtimeRole)}`;
      await tx`grant insert (id, tenant_id, case_id, event_kind, actor_kind, actor_user_id, occurred_at, correlation_id)
        on public.case_events to ${tx(runtimeRole)}`;
    });
    console.log("Minimal Case persistence grants applied; lifecycle and history mutation remain unavailable.");
  } finally { await client.end({ timeout: 5 }); }
}
main().catch(() => {
  console.error("Case grants failed; verify migration, role safety and existing ACLs. Details redacted.");
  process.exitCode = 1;
});
