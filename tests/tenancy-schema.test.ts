import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "../src/platform/db/schema/index";

function tenancyTable(name: string): PgTable {
  const table = (schema as Record<string, unknown>)[name] as PgTable;
  expect(table, `${name} persistence is required`).toBeDefined();
  return table;
}

describe("Seller Shield tenancy persistence contract", () => {
  it("keeps Tenant a minimal UUID ownership root with historical GLOBAL creator", () => {
    const table = tenancyTable("tenants");
    const columns = getTableColumns(table);
    expect(Object.keys(columns).sort()).toEqual(["createdAt", "createdByUserId", "id", "name", "updatedAt"]);
    expect(columns.id.getSQLType()).toBe("uuid");
    expect(columns.id.primary).toBe(true);
    expect(columns.id.hasDefault).toBe(true);
    expect(columns.name.getSQLType()).toBe("text");
    expect(Object.values(columns).every((column) => column.notNull)).toBe(true);
    expect(columns.createdByUserId.getSQLType()).toBe("uuid");
    expect(columns.createdAt.getSQLType()).toBe("timestamp with time zone");
    expect(columns.updatedAt.getSQLType()).toBe("timestamp with time zone");
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf("function");
    expect(getTableConfig(table).foreignKeys.map((fk) => fk.onDelete)).toEqual(["restrict"]);
  });

  it("keeps Membership role closed and status checked-text without invitation state", () => {
    const table = tenancyTable("memberships");
    const columns = getTableColumns(table);
    expect(Object.keys(columns).sort()).toEqual([
      "createdByUserId", "id", "joinedAt", "revokedAt", "role", "status", "tenantId", "userId",
    ]);
    expect(columns.id.primary).toBe(true);
    expect(columns.id.hasDefault).toBe(true);
    for (const name of ["id", "tenantId", "userId", "createdByUserId"]) {
      expect(columns[name].getSQLType()).toBe("uuid");
    }
    expect(columns.role.enumValues).toEqual(["OWNER", "OPERATOR", "REVIEWER"]);
    expect(columns.role.getSQLType()).toBe("membership_role");
    expect(columns.status.getSQLType()).toBe("text");
    expect(Object.values(columns).filter((column) => !column.notNull).map((column) => column.name).sort())
      .toEqual(["created_by_user_id", "revoked_at"]);
    expect(columns.joinedAt.getSQLType()).toBe("timestamp with time zone");
    expect(columns.revokedAt.getSQLType()).toBe("timestamp with time zone");
    expect(getTableConfig(table).foreignKeys.map((fk) => fk.onDelete)).toEqual(["restrict", "restrict", "restrict"]);
  });

  it("enables policy-free RLS on both tenancy tables", () => {
    for (const name of ["tenants", "memberships"]) {
      const config = getTableConfig(tenancyTable(name));
      expect(config.enableRLS).toBe(true);
      expect(config.policies).toEqual([]);
    }
  });
});
