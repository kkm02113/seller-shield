import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgPolicy, pgRole, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.ts";

export const membershipRole = pgEnum("membership_role", ["OWNER", "OPERATOR", "REVIEWER"]);
export type MembershipStatus = "ACTIVE" | "REVOKED";
const bootstrapRole = pgRole("seller_shield_bootstrap").existing();
const actor = sql`nullif(current_setting('app.actor_id', true), '')::uuid`;
const tenant = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  // Historical attribution only; this FK never grants tenant authorization.
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  check("tenants_name_check", sql`char_length(${table.name}) between 1 and 80 and ${table.name} = btrim(${table.name})`),
  pgPolicy("tenants_member_select", { for: "select", to: "public", using: sql`exists (
    select 1 from public.memberships m where m.tenant_id = ${table.id} and m.user_id = ${actor} and m.status = 'ACTIVE')` }),
  pgPolicy("tenants_owner_update", { for: "update", to: "public",
    using: sql`${table.id} = ${tenant} and exists (select 1 from public.memberships m
      where m.tenant_id = ${table.id} and m.user_id = ${actor} and m.status = 'ACTIVE' and m.role = 'OWNER')`,
    withCheck: sql`${table.id} = ${tenant} and exists (select 1 from public.memberships m
      where m.tenant_id = ${table.id} and m.user_id = ${actor} and m.status = 'ACTIVE' and m.role = 'OWNER')` }),
  pgPolicy("tenants_bootstrap_insert", { for: "insert", to: bootstrapRole,
    withCheck: sql`${table.createdByUserId} = ${actor}` }),
]).enableRLS();

export const memberships = pgTable("memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  role: membershipRole("role").notNull(),
  status: text("status").$type<MembershipStatus>().notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "restrict" }),
}, (table) => [
  unique("memberships_tenant_user_unique").on(table.tenantId, table.userId),
  check("memberships_status_check", sql`${table.status} in ('ACTIVE', 'REVOKED')`),
  check("memberships_revocation_check", sql`(${table.status} = 'ACTIVE' and ${table.revokedAt} is null) or (${table.status} = 'REVOKED' and ${table.revokedAt} is not null)`),
  index("memberships_user_status_tenant_idx").on(table.userId, table.status, table.tenantId),
  index("memberships_tenant_status_role_idx").on(table.tenantId, table.status, table.role),
  pgPolicy("memberships_actor_select", { for: "select", to: "public", using: sql`${table.userId} = ${actor} and ${table.status} = 'ACTIVE'` }),
  // UPDATE visibility is required for row locking; WITH CHECK forbids mutations.
  pgPolicy("memberships_actor_lock", { for: "update", to: "public", using: sql`${table.userId} = ${actor} and ${table.status} = 'ACTIVE'`, withCheck: sql`false` }),
  pgPolicy("memberships_bootstrap_insert", { for: "insert", to: bootstrapRole,
    withCheck: sql`${table.userId} = ${actor} and ${table.createdByUserId} = ${actor}
      and ${table.role} = 'OWNER' and ${table.status} = 'ACTIVE' and ${table.revokedAt} is null` }),
]).enableRLS();

// Pinned Drizzle models ENABLE RLS. FORCE RLS is reviewed SQL in migration
// 0002_tenancy-foundation.sql and verified against PostgreSQL catalogs/tests.
// Bootstrap function/ownership is explicit reviewed SQL; its role is provisioned
// outside schema generation. Runtime privileges are a separate owner-only command.
