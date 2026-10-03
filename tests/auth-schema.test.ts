import { getSchema } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { createAuthentication } from "../src/platform/auth/factory";
import { createDatabaseConnection } from "../src/platform/db/connection";
import * as schema from "../src/platform/db/schema/index";

describe("Better Auth core physical schema", () => {
  it("contains only the four plural GLOBAL tables", () => {
    expect(Object.keys(schema).sort()).toEqual(["accounts", "sessions", "users", "verifications"]);
  });

  it("matches upstream required fields while preserving UUIDs and timezone-aware timestamps", async () => {
    const connection = createDatabaseConnection("postgresql://unused:unused@127.0.0.1:1/unused");
    try {
      const auth = createAuthentication(connection.db, {
        secret: "Synthetic-schema-test-secret.0123456789!",
        baseURL: "http://localhost:3000",
      });
      const official = getSchema(auth.options);
      for (const [model, definition] of Object.entries(official)) {
        const table = schema[`${model}s` as keyof typeof schema];
        expect(table).toBeDefined();
        const columns = getTableColumns(table);
        expect(Object.keys(columns).sort()).toEqual(["id", ...Object.keys(definition.fields)].sort());
        expect(columns.id.getSQLType()).toBe("uuid");
        expect(columns.id.primary).toBe(true);
        expect(columns.id.hasDefault).toBe(true);
        for (const [field, contract] of Object.entries(definition.fields)) {
          const column = columns[field as keyof typeof columns];
          expect(column.notNull, `${model}.${field} required`).toBe(contract.required === true);
          if (contract.type === "date") expect(column.getSQLType()).toBe("timestamp with time zone");
          if (contract.references) expect(column.getSQLType()).toBe("uuid");
          if (contract.unique) expect(column.isUnique).toBe(true);
        }
        expect(columns.updatedAt.onUpdateFn).toBeTypeOf("function");
      }
      expect(getTableConfig(schema.accounts).foreignKeys[0].onDelete).toBe("cascade");
      expect(getTableConfig(schema.sessions).foreignKeys[0].onDelete).toBe("cascade");
      expect(getTableConfig(schema.accounts).uniqueConstraints).toHaveLength(0);
      expect(schema.verifications.identifier.isUnique).toBe(false);
      expect(schema.verifications.value.isUnique).toBe(false);
      expect(getTableConfig(schema.sessions).indexes.map((index) => index.config.name)).toContain("sessions_expires_at_idx");
      expect(getTableConfig(schema.verifications).indexes.map((index) => index.config.name)).toContain("verifications_expires_at_idx");
    } finally {
      await connection.client.end({ timeout: 1 });
    }
  });
});
