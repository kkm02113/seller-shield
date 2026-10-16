import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { openTenancyDatabase, rollbackProbe } from "./helpers/tenancy-fixtures";
import { withCaseFixture } from "./helpers/case-fixtures";

const database = openTenancyDatabase();
afterAll(() => database.close());
const names = ["case_events", "cases", "claim_snapshots"];

describe("Case persistence real PostgreSQL catalog and constraints", () => {
  it("runs the grant command idempotently and refuses an elevated runtime identity with redacted output", () => {
    const run = (extra: Record<string, string> = {}) => spawnSync(process.execPath, ["scripts/db-grant-cases.ts"], {
      env: { ...process.env, ...extra }, encoding: "utf8", timeout: 10_000,
    });
    for (let i = 0; i < 2; i++) {
      const result = run();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Minimal Case persistence grants applied");
    }
    const refused = run({ DATABASE_URL: process.env.DATABASE_TEST_ADMIN_URL! });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("Details redacted.");
    for (const key of ["DATABASE_URL", "DATABASE_MIGRATION_URL", "DATABASE_TEST_ADMIN_URL"]) {
      const url = process.env[key]!;
      const password = decodeURIComponent(new URL(url).password);
      expect(refused.stdout + refused.stderr).not.toContain(url);
      if (password) expect(refused.stdout + refused.stderr).not.toContain(password);
    }
  });
  it("has exactly three new migrator-owned FORCE RLS tables and five migrations", async () => {
    const rows = await database.owner`select c.relname, c.relrowsecurity, c.relforcerowsecurity,
      c.relowner = (select oid from pg_roles where rolname = current_user) as owns
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ${database.owner(names)} order by c.relname`;
    expect(rows).toEqual(names.map((relname) => ({ relname, relrowsecurity: true, relforcerowsecurity: true, owns: true })));
    expect(await database.owner`select count(*)::integer as count from drizzle.__drizzle_migrations`).toEqual([{ count: 5 }]);
  });
  it("grants explicit INSERT columns, normalization-only Case UPDATE and no destructive privilege", async () => {
    const rows = await database.client`select c.relname,
      has_table_privilege(current_user, c.oid, 'SELECT') as read,
      has_table_privilege(current_user, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as broad_write,
      pg_has_role(current_user, c.relowner, 'MEMBER') as owner_member
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ${database.client(names)} order by c.relname`;
    expect(rows).toEqual(names.map((relname) => ({ relname, read: true, broad_write: false, owner_member: false })));
    const columns = await database.client`select table_name, column_name,
      has_column_privilege(current_user, 'public.' || table_name, column_name, 'INSERT') as ins,
      has_column_privilege(current_user, 'public.' || table_name, column_name, 'UPDATE') as upd
      from information_schema.columns where table_schema = 'public' and table_name in ${database.client(names)}`;
    expect(columns.filter((c) => c.upd).map((c) => c.column_name).sort()).toEqual([
      "due_at", "external_case_reference", "external_order_reference", "last_activity_at", "marketplace", "title", "updated_at",
    ]);
    expect(columns.filter((c) => !c.ins).map((c) => `${c.table_name}.${c.column_name}`).sort()).toEqual([
      "case_events.display_metadata", "case_events.source_job_id", "cases.closure_disposition", "cases.logically_deleted_at", "cases.state",
    ]);
  });
  it("has explicit write checks and no UPDATE/DELETE policy on immutable history", async () => {
    const policies = await database.owner`select tablename, policyname, cmd, qual, with_check from pg_policies
      where schemaname = 'public' and tablename in ${database.owner(names)} order by policyname`;
    expect(policies.map((p) => p.policyname)).toEqual(["case_events_domain_insert", "case_events_member_select", "cases_member_select",
      "cases_operator_insert", "cases_operator_update", "claim_snapshots_member_select", "claim_snapshots_operator_insert"]);
    for (const p of policies) {
      if (["INSERT", "UPDATE"].includes(p.cmd)) expect(p.with_check).toBeTruthy();
      if (["SELECT", "UPDATE"].includes(p.cmd)) expect(p.qual).toBeTruthy();
    }
    expect(policies.filter((p) => p.cmd === "DELETE" || (p.cmd === "UPDATE" && p.tablename !== "cases"))).toEqual([]);
  });
  it("stores tenant-composite RESTRICT relationships and exact Inbox/reference/timeline indexes", async () => {
    const constraints = await database.owner`select c.relname, con.contype, pg_get_constraintdef(con.oid) as def
      from pg_constraint con join pg_class c on c.oid = con.conrelid
      where c.relnamespace = 'public'::regnamespace and c.relname in ${database.owner(names)}`;
    const fks = constraints.filter((c) => c.contype === "f");
    expect(fks).toHaveLength(8);
    expect(fks.every((c) => c.def.endsWith("ON DELETE RESTRICT"))).toBe(true);
    for (const name of ["claim_snapshots", "case_events"]) expect(fks.filter((c) => c.relname === name).map((c) => c.def))
      .toContain("FOREIGN KEY (tenant_id, case_id) REFERENCES cases(tenant_id, id) ON DELETE RESTRICT");
    const indexes = await database.owner`select indexname, indexdef from pg_indexes where schemaname = 'public'
      and tablename in ${database.owner(names)} order by indexname`;
    expect(indexes.map((i) => i.indexname)).toEqual([
      "case_events_pkey", "case_events_tenant_id_unique", "case_events_timeline_idx", "cases_case_reference_idx", "cases_inbox_idx",
      "cases_order_reference_idx", "cases_pkey", "cases_tenant_id_unique", "claim_snapshots_case_id_unique",
      "claim_snapshots_case_revision_unique", "claim_snapshots_pkey", "claim_snapshots_tenant_id_unique",
    ]);
    expect(indexes.find((i) => i.indexname === "cases_inbox_idx")?.indexdef).toContain("(tenant_id, state, last_activity_at DESC NULLS LAST, id DESC NULLS LAST)");
    expect(indexes.find((i) => i.indexname === "cases_order_reference_idx")?.indexdef).toContain("WHERE (external_order_reference IS NOT NULL)");
    expect(indexes.find((i) => i.indexname === "cases_case_reference_idx")?.indexdef).toContain("WHERE (external_case_reference IS NOT NULL)");
    expect(indexes.find((i) => i.indexname === "case_events_timeline_idx")?.indexdef).toContain("(tenant_id, case_id, occurred_at, id)");
  });
  it("requires CLOSED/disposition pairing and stores every legitimate closure reason, not Outcome", async () => {
    await withCaseFixture(database, async (f) => {
      for (const [state, disposition] of [["CLOSED", null], ["DRAFT", "OTHER"], ["RESOLVED", "OTHER"]]) {
        await expect(rollbackProbe(database.admin, (tx) => tx`update public.cases set state = ${state}, closure_disposition = ${disposition}
          where id = ${f.caseA}`)).rejects.toMatchObject({ code: "23514" });
      }
      await expect(rollbackProbe(database.admin, (tx) => tx`update public.cases set state = 'BUYER_RISK' where id = ${f.caseA}`))
        .rejects.toMatchObject({ code: "22P02" });
      for (const disposition of ["LEGITIMATE_RETURN", "NOT_DISPUTABLE", "INSUFFICIENT_EVIDENCE", "DUPLICATE", "WITHDRAWN", "OTHER"]) {
        expect(await rollbackProbe(database.admin, (tx) => tx`update public.cases set state = 'CLOSED', closure_disposition = ${disposition}
          where id = ${f.caseA} returning closure_disposition`)).toEqual([{ closure_disposition: disposition }]);
      }
    });
  });
  it("enforces source revision/digest/content checks independently of runtime ACLs", async () => {
    await withCaseFixture(database, async (f) => {
      for (const values of [{ revision: 0 }, { revision: -1 }, { content_sha256: Buffer.alloc(31) },
        { raw_text: null, raw_payload: null, source_url: null }, { source_type: "  " }, { capture_method: "" }]) {
        await expect(rollbackProbe(database.admin, (tx) => tx`update public.claim_snapshots set ${tx(values)} where tenant_id = ${f.tenantA}`))
          .rejects.toMatchObject({ code: "23514" });
      }
      for (const values of [{ actor_kind: "JOB", source_job_id: randomUUID() }, { actor_user_id: null },
        { source_job_id: randomUUID() }, { display_metadata: { raw_source: "not permitted" } }, { event_kind: "ARBITRARY_EVENT" }]) {
        await expect(rollbackProbe(database.admin, (tx) => tx`update public.case_events set ${tx(values)} where tenant_id = ${f.tenantA}`))
          .rejects.toMatchObject({ code: "23514" });
      }
    });
  });
});
