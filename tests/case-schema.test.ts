import { getTableColumns, is, Table } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../src/platform/db/schema";

function table(name: string): PgTable {
  const found = Object.values(schema).find((value) => is(value, Table) && getTableConfig(value as PgTable).name === name);
  expect(found, `Missing ${name} persistence declaration`).toBeDefined();
  return found as PgTable;
}

describe("Case persistence physical contract", () => {
  it.each([
    ["cases", ["id", "tenant_id", "title", "marketplace", "external_case_reference", "external_order_reference", "state", "closure_disposition", "due_at", "last_activity_at", "created_by_user_id", "created_at", "updated_at", "logically_deleted_at"], ["closure_disposition", "due_at", "external_case_reference", "external_order_reference", "logically_deleted_at", "marketplace"]],
    ["claim_snapshots", ["id", "tenant_id", "case_id", "revision", "source_type", "source_label", "source_url", "external_claim_reference", "raw_text", "raw_payload", "content_sha256", "captured_at", "captured_by_user_id", "capture_method", "created_at"], ["captured_by_user_id", "external_claim_reference", "raw_payload", "raw_text", "source_label", "source_url"]],
    ["case_events", ["id", "tenant_id", "case_id", "event_kind", "actor_kind", "actor_user_id", "source_job_id", "occurred_at", "correlation_id", "display_metadata"], ["actor_user_id", "correlation_id", "source_job_id"]],
  ])("declares exact %s columns, UUID defaults and nullable fields", (name, names, nullable) => {
    const columns = Object.values(getTableColumns(table(name as string)));
    expect(columns.map((column) => column.name)).toEqual(names);
    expect(columns.filter((column) => !column.notNull).map((column) => column.name).sort()).toEqual(nullable);
    expect(columns[0].primary).toBe(true);
    expect(columns[0].hasDefault).toBe(true);
    for (const column of columns) {
      if (column.name === "id" || column.name.endsWith("_id")) expect(column.getSQLType()).toBe("uuid");
      else if (column.name.endsWith("_at")) expect(column.getSQLType()).toBe("timestamp with time zone");
      else if (["raw_payload", "display_metadata"].includes(column.name)) expect(column.getSQLType()).toBe("jsonb");
      else if (column.name === "content_sha256") expect(column.getSQLType()).toBe("bytea");
      else if (column.name === "revision") expect(column.getSQLType()).toBe("integer");
      else if (!["state", "closure_disposition"].includes(column.name)) expect(column.getSQLType()).toBe("text");
    }
  });

  it("stores the canonical lifecycle without adding buyer classifications", () => {
    const columns = getTableColumns(table("cases"));
    expect(columns.state.enumValues).toEqual(["DRAFT", "GATHERING_EVIDENCE", "READY_FOR_REVIEW", "PACKAGE_READY", "SUBMITTED", "RESOLVED", "CLOSED"]);
    expect(columns.closureDisposition.enumValues).toEqual(["LEGITIMATE_RETURN", "NOT_DISPUTABLE", "INSUFFICIENT_EVIDENCE", "DUPLICATE", "WITHDRAWN", "OTHER"]);
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf("function");
    expect(getTableConfig(table("cases")).checks.map((c) => c.name)).toEqual(["cases_closure_check"]);
  });

  it.each(["claim_snapshots", "case_events"])("keeps %s relationships tenant-composite and RESTRICTed", (name) => {
    const config = getTableConfig(table(name));
    expect(config.foreignKeys.map((key) => key.onDelete)).toEqual(["restrict", "restrict", "restrict"]);
    expect(config.foreignKeys.map((key) => {
      const ref = key.reference();
      return [ref.columns.map((column) => column.name), ref.foreignColumns.map((column) => column.name)];
    })).toContainEqual([["tenant_id", "case_id"], ["tenant_id", "id"]]);
    expect(Object.keys(getTableColumns(table(name)))).not.toContain("updatedAt");
  });

  it("declares revision/same-case uniqueness and minimal query indexes", () => {
    expect(getTableConfig(table("cases")).foreignKeys.map((key) => key.onDelete)).toEqual(["restrict", "restrict"]);
    expect(getTableConfig(table("cases")).uniqueConstraints.map((c) => c.columns.map((column) => column.name)))
      .toEqual([["tenant_id", "id"]]);
    expect(getTableConfig(table("claim_snapshots")).uniqueConstraints.map((c) => c.columns.map((column) => column.name)))
      .toEqual([["tenant_id", "id"], ["tenant_id", "case_id", "id"], ["tenant_id", "case_id", "revision"]]);
    expect(getTableConfig(table("cases")).indexes.map((i) => i.config.name)).toEqual([
      "cases_inbox_idx", "cases_order_reference_idx", "cases_case_reference_idx",
    ]);
    expect(getTableConfig(table("claim_snapshots")).indexes).toEqual([]);
    expect(getTableConfig(table("case_events")).indexes.map((i) => i.config.name)).toEqual(["case_events_timeline_idx"]);
  });

  it.each([
    ["cases", ["cases_member_select", "cases_operator_insert", "cases_operator_update"]],
    ["claim_snapshots", ["claim_snapshots_member_select", "claim_snapshots_operator_insert"]],
    ["case_events", ["case_events_member_select", "case_events_domain_insert"]],
  ])("enables RLS on %s without delete or immutable-row update policies", (name, names) => {
    const config = getTableConfig(table(name as string));
    expect(config.enableRLS).toBe(true);
    expect(config.policies.map((p) => p.name)).toEqual(names);
    for (const policy of config.policies) {
      if (["insert", "update"].includes(policy.for!)) expect(policy.withCheck).toBeDefined();
    }
  });
});
