import { sql, type SQL } from "drizzle-orm";
import { check, customType, foreignKey, index, integer, jsonb, pgEnum, pgPolicy, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.ts";
import { tenants } from "./tenancy.ts";

export const caseState = pgEnum("case_state", [
  "DRAFT", "GATHERING_EVIDENCE", "READY_FOR_REVIEW", "PACKAGE_READY", "SUBMITTED", "RESOLVED", "CLOSED",
]);
export const caseDisposition = pgEnum("case_disposition", [
  "LEGITIMATE_RETURN", "NOT_DISPUTABLE", "INSUFFICIENT_EVIDENCE", "DUPLICATE", "WITHDRAWN", "OTHER",
]);
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const actor = sql`nullif(current_setting('app.actor_id', true), '')::uuid`;
const tenant = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;
// Authentication/context establishment stays in tenant-context, not in a second
// authorization helper. Membership's actor-only SELECT policy is nonrecursive.
function memberScope(tenantId: SQL, write = false): SQL {
  return sql`${tenantId} = ${tenant} and exists (select 1 from public.memberships m
    where m.tenant_id = ${tenantId} and m.user_id = ${actor} and m.status = 'ACTIVE'
    ${write ? sql`and m.role in ('OWNER', 'OPERATOR')` : sql``})`;
}

export const cases = pgTable("cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  marketplace: text("marketplace"),
  externalCaseReference: text("external_case_reference"),
  externalOrderReference: text("external_order_reference"),
  state: caseState("state").default("DRAFT").notNull(),
  closureDisposition: caseDisposition("closure_disposition"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  logicallyDeletedAt: timestamp("logically_deleted_at", { withTimezone: true }),
}, (table) => [
  unique("cases_tenant_id_unique").on(table.tenantId, table.id),
  check("cases_closure_check", sql`(${table.state} = 'CLOSED') = (${table.closureDisposition} is not null)`),
  index("cases_inbox_idx").on(table.tenantId, table.state, table.lastActivityAt.desc(), table.id.desc()),
  index("cases_order_reference_idx").on(table.tenantId, table.marketplace, table.externalOrderReference)
    .where(sql`${table.externalOrderReference} is not null`),
  index("cases_case_reference_idx").on(table.tenantId, table.marketplace, table.externalCaseReference)
    .where(sql`${table.externalCaseReference} is not null`),
  pgPolicy("cases_member_select", { for: "select", to: "public", using: memberScope(sql`${table.tenantId}`) }),
  pgPolicy("cases_operator_insert", { for: "insert", to: "public", withCheck: sql`${memberScope(sql`${table.tenantId}`, true)}
    and ${table.createdByUserId} = ${actor} and ${table.state} = 'DRAFT'
    and ${table.closureDisposition} is null and ${table.logicallyDeletedAt} is null` }),
  pgPolicy("cases_operator_update", { for: "update", to: "public",
    using: sql`${memberScope(sql`${table.tenantId}`, true)} and ${table.state} in ('DRAFT', 'GATHERING_EVIDENCE')`,
    withCheck: sql`${memberScope(sql`${table.tenantId}`, true)} and ${table.state} in ('DRAFT', 'GATHERING_EVIDENCE')` }),
]).enableRLS();

export const claimSnapshots = pgTable("claim_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  caseId: uuid("case_id").notNull(),
  revision: integer("revision").notNull(),
  sourceType: text("source_type").notNull(),
  sourceLabel: text("source_label"),
  sourceUrl: text("source_url"),
  externalClaimReference: text("external_claim_reference"),
  rawText: text("raw_text"),
  rawPayload: jsonb("raw_payload"),
  contentSha256: bytea("content_sha256").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  capturedByUserId: uuid("captured_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  captureMethod: text("capture_method").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("claim_snapshots_tenant_id_unique").on(table.tenantId, table.id),
  unique("claim_snapshots_case_id_unique").on(table.tenantId, table.caseId, table.id),
  unique("claim_snapshots_case_revision_unique").on(table.tenantId, table.caseId, table.revision),
  foreignKey({ columns: [table.tenantId, table.caseId], foreignColumns: [cases.tenantId, cases.id],
    name: "claim_snapshots_tenant_case_fk" }).onDelete("restrict"),
  check("claim_snapshots_revision_check", sql`${table.revision} > 0`),
  check("claim_snapshots_source_check", sql`${table.rawText} is not null or ${table.rawPayload} is not null or ${table.sourceUrl} is not null`),
  check("claim_snapshots_digest_check", sql`octet_length(${table.contentSha256}) = 32`),
  check("claim_snapshots_source_type_check", sql`length(btrim(${table.sourceType})) > 0`),
  check("claim_snapshots_capture_method_check", sql`length(btrim(${table.captureMethod})) > 0`),
  pgPolicy("claim_snapshots_member_select", { for: "select", to: "public", using: memberScope(sql`${table.tenantId}`) }),
  pgPolicy("claim_snapshots_operator_insert", { for: "insert", to: "public",
    withCheck: sql`${memberScope(sql`${table.tenantId}`, true)} and ${table.capturedByUserId} = ${actor}` }),
]).enableRLS();

export const caseEvents = pgTable("case_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  caseId: uuid("case_id").notNull(),
  eventKind: text("event_kind").$type<"CASE_CREATED" | "CLAIM_SNAPSHOT_ADDED" | "STATE_CHANGED" | "CASE_CLOSED">().notNull(),
  actorKind: text("actor_kind").$type<"HUMAN">().notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
  sourceJobId: uuid("source_job_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  correlationId: uuid("correlation_id"),
  displayMetadata: jsonb("display_metadata").$type<Record<string, never>>().default({}).notNull(),
}, (table) => [
  unique("case_events_tenant_id_unique").on(table.tenantId, table.id),
  foreignKey({ columns: [table.tenantId, table.caseId], foreignColumns: [cases.tenantId, cases.id],
    name: "case_events_tenant_case_fk" }).onDelete("restrict"),
  check("case_events_kind_check", sql`${table.eventKind} in ('CASE_CREATED', 'CLAIM_SNAPSHOT_ADDED', 'STATE_CHANGED', 'CASE_CLOSED')`),
  check("case_events_actor_check", sql`${table.actorKind} = 'HUMAN' and ${table.actorUserId} is not null and ${table.sourceJobId} is null`),
  check("case_events_metadata_check", sql`${table.displayMetadata} = '{}'::jsonb`),
  index("case_events_timeline_idx").on(table.tenantId, table.caseId, table.occurredAt, table.id),
  pgPolicy("case_events_member_select", { for: "select", to: "public", using: memberScope(sql`${table.tenantId}`) }),
  pgPolicy("case_events_domain_insert", { for: "insert", to: "public",
    withCheck: sql`${memberScope(sql`${table.tenantId}`, true)} and ${table.actorUserId} = ${actor}
      and ${table.actorKind} = 'HUMAN' and ${table.eventKind} in ('CASE_CREATED', 'CLAIM_SNAPSHOT_ADDED')` }),
]).enableRLS();
