import { randomUUID } from "node:crypto";

import { makeSignature } from "better-auth/crypto";
import type { User, Verification } from "better-auth/types";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createAuthentication } from "../src/platform/auth/factory";
import { createDatabaseConnection } from "../src/platform/db/connection";
import { requireDatabaseUrl } from "../src/platform/db/env";
import { loadDatabaseEnvironment } from "../src/platform/db/local-env";
import * as schema from "../src/platform/db/schema/index";

loadDatabaseEnvironment();
const connection = createDatabaseConnection(requireDatabaseUrl(process.env), { maxConnections: 2 });
const secret = "Synthetic-DB-integration-secret.0123456789!";
const auth = createAuthentication(connection.db, { secret, baseURL: "http://localhost:3000" });
const context = await auth.$context;
const fixtures = new Set<string>();
const verificationFixtures = new Set<string>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function createUser() {
  const user = await context.adapter.create<User>({ model: "user", data: {
    name: "Synthetic adapter fixture",
    email: `slice-1b-${randomUUID()}@example.test`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date("2000-01-01T00:00:00Z"),
  } });
  fixtures.add(user.id);
  return user;
}

async function sessionHeaders(token: string) {
  // Use Better Auth's own signature helper; this is a fixture, not a sign-in flow.
  const signed = `${token}.${await makeSignature(token, secret)}`;
  return new Headers({ cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(signed)}` });
}

async function findVerificationFixture(identifier: string): Promise<Verification | null> {
  // The internal lookup also globally prunes expired rows. Test assertions must
  // read only their fixture; do not change production cleanup behavior to isolate tests.
  return context.adapter.findOne<Verification>({
    model: "verification", where: [{ field: "identifier", value: identifier }],
  });
}

async function postgresErrorCode(operation: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await operation();
    return undefined;
  } catch (error) {
    let current: unknown = error;
    while (current instanceof Error) {
      if ("code" in current && typeof current.code === "string") return current.code;
      current = current.cause;
    }
    return "unrecognized-error";
  }
}

afterEach(async () => {
  // Delete only this run's synthetic IDs; never truncate a shared database.
  for (const id of fixtures) await context.adapter.delete({ model: "user", where: [{ field: "id", value: id }] });
  for (const identifier of verificationFixtures) await context.internalAdapter.deleteVerificationByIdentifier(identifier);
  fixtures.clear();
  verificationFixtures.clear();
});
afterAll(() => connection.client.end({ timeout: 5 }));

describe("Better Auth ↔ Drizzle ↔ real PostgreSQL", () => {
  it("has the reviewed columns, defaults, indexes, constraints, and migration ownership in PostgreSQL", async () => {
    const columns = await connection.client`select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`;
    const indexes = await connection.client`select tablename, indexname from pg_indexes where schemaname = 'public'`;
    const constraints = await connection.client`select c.relname, con.contype, pg_get_constraintdef(con.oid) as definition
      from pg_constraint con join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'`;
    const owners = await connection.client`select c.relname, r.rolname as owner from pg_class c
      join pg_roles r on r.oid = c.relowner join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`;
    const [databaseOwner] = await connection.client`select r.rolname as owner from pg_database d
      join pg_roles r on r.oid = d.datdba where d.datname = current_database()`;
    expect(columns).toHaveLength(38);
    for (const table of Object.values(schema)) {
      const name = getTableName(table);
      const tableColumns = getTableColumns(table);
      const actual = columns.filter((column) => column.table_name === name);
      expect(actual.map((column) => column.column_name).sort()).toEqual(Object.values(tableColumns).map((column) => column.name).sort());
      for (const column of Object.values(tableColumns)) {
        const observed = actual.find((record) => record.column_name === column.name);
        expect(observed?.data_type).toBe(column.getSQLType());
        expect(observed?.is_nullable === "NO").toBe(column.notNull);
        if (column.name === "id") expect(observed?.column_default).toContain("gen_random_uuid()");
      }
      for (const index of getTableConfig(table).indexes) {
        expect(indexes.some((record) => record.tablename === name && record.indexname === index.config.name)).toBe(true);
      }
      expect(owners.find((record) => record.relname === name)?.owner).toBe(databaseOwner.owner);
    }
    expect(constraints.filter((constraint) => constraint.contype === "u").map((constraint) => constraint.definition).sort())
      .toEqual(["UNIQUE (email)", "UNIQUE (key)", "UNIQUE (token)"]);
    expect(constraints.filter((constraint) => constraint.contype === "f").map((constraint) => constraint.definition))
      .toEqual(["FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE", "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"]);
    // These defaults intentionally follow the generator; updates are Drizzle callbacks, not DB triggers.
    expect(columns.filter((column) => ["sessions", "accounts"].includes(column.table_name) && column.column_name === "updated_at")
      .every((column) => column.column_default === null)).toBe(true);
  });

  it("persists a GLOBAL UUID User and advances updatedAt through the official adapter", async () => {
    const user = await createUser();
    expect(user.id).toMatch(uuid);
    expect((await context.internalAdapter.findUserById(user.id))?.email).toBe(user.email);
    const updated = await context.internalAdapter.updateUser(user.id, { name: "Updated synthetic fixture" });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());
    const rows = await connection.client`select id, name, email_verified from public.users where id = ${user.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Updated synthetic fixture");
    expect(rows[0].email_verified).toBe(false);
  });

  it("loads database sessions via Better Auth's session API and rejects expiry/revocation", async () => {
    const user = await createUser();
    const session = await context.internalAdapter.createSession(user.id);
    expect(session.id).toMatch(uuid);
    const rows = await connection.client`select user_id from public.sessions where id = ${session.id}`;
    expect(rows[0].user_id).toBe(user.id);
    const headers = await sessionHeaders(session.token);
    expect((await auth.api.getSession({ headers }))?.user.id).toBe(user.id);
    await context.internalAdapter.updateSession(session.token, { expiresAt: new Date(Date.now() - 60_000) });
    expect(await auth.api.getSession({ headers })).toBeNull();
    const active = await context.internalAdapter.createSession(user.id);
    const activeHeaders = await sessionHeaders(active.token);
    expect((await auth.api.getSession({ headers: activeHeaders }))?.session.id).toBe(active.id);
    await context.internalAdapter.deleteSession(active.token);
    expect(await auth.api.getSession({ headers: activeHeaders })).toBeNull();
  });

  it("persists isolated Account fixtures without enabling a provider, and cascades User deletion", async () => {
    const user = await createUser();
    const account = await context.internalAdapter.createAccount({
      userId: user.id, accountId: randomUUID(), providerId: "synthetic-adapter-test-only",
    });
    expect(account.id).toMatch(uuid);
    expect((await context.internalAdapter.findAccounts(user.id))[0].id).toBe(account.id);
    const session = await context.internalAdapter.createSession(user.id);
    await context.adapter.delete({ model: "user", where: [{ field: "id", value: user.id }] });
    fixtures.delete(user.id);
    expect(await context.internalAdapter.findUserById(user.id)).toBeNull();
    expect(await context.internalAdapter.findAccounts(user.id)).toEqual([]);
    expect(await context.internalAdapter.findSession(session.token)).toBeNull();
  });

  it("creates, atomically consumes, expires, and deletes core Verification fixtures", async () => {
    const identifier = `slice-1b-${randomUUID()}`;
    verificationFixtures.add(identifier);
    const verification = await context.internalAdapter.createVerificationValue({
      identifier, value: randomUUID(), expiresAt: new Date(Date.now() + 60_000),
    });
    expect(verification.id).toMatch(uuid);
    expect((await findVerificationFixture(identifier))?.id).toBe(verification.id);
    const consumed = await Promise.all([
      context.internalAdapter.consumeVerificationValue(identifier),
      context.internalAdapter.consumeVerificationValue(identifier),
    ]);
    expect(consumed.filter(Boolean)).toHaveLength(1);
    expect(await findVerificationFixture(identifier)).toBeNull();
    await context.internalAdapter.createVerificationValue({
      identifier, value: randomUUID(), expiresAt: new Date(Date.now() - 60_000),
    });
    expect(await context.internalAdapter.consumeVerificationValue(identifier)).toBeNull();
    await context.internalAdapter.createVerificationValue({
      identifier, value: randomUUID(), expiresAt: new Date(Date.now() + 60_000),
    });
    await context.internalAdapter.deleteVerificationByIdentifier(identifier);
    expect(await findVerificationFixture(identifier)).toBeNull();
  });

  it("fixture read assertions preserve unrelated expired verification rows", async () => {
    const target = `slice-1b-${randomUUID()}`;
    const sentinel = `slice-1b-expired-sentinel-${randomUUID()}`;
    verificationFixtures.add(target);
    verificationFixtures.add(sentinel);
    const preserved = await context.internalAdapter.createVerificationValue({
      identifier: sentinel, value: randomUUID(), expiresAt: new Date(Date.now() - 60_000),
    });
    await context.internalAdapter.createVerificationValue({
      identifier: target, value: randomUUID(), expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await findVerificationFixture(target)).not.toBeNull();
    const observed = await context.adapter.findOne<Verification>({
      model: "verification", where: [{ field: "identifier", value: sentinel }],
    });
    expect(observed?.id).toBe(preserved.id);
  });

  it("rejects duplicate tokens, duplicate emails, and invalid UUID foreign keys in PostgreSQL", async () => {
    const user = await createUser();
    const session = await context.internalAdapter.createSession(user.id);
    // overrideAll is required: the default creation seam always generates a fresh token.
    expect(await postgresErrorCode(() => context.internalAdapter.createSession(user.id, false, { token: session.token }, true)))
      .toBe("23505");
    expect(await postgresErrorCode(() => context.adapter.create({ model: "user", data: { name: "Duplicate fixture", email: user.email } })))
      .toBe("23505");
    expect(await postgresErrorCode(() => context.internalAdapter.createSession(randomUUID()))).toBe("23503");
    expect(await postgresErrorCode(() => context.internalAdapter.createAccount({
      userId: randomUUID(), accountId: randomUUID(), providerId: "synthetic-adapter-test-only",
    }))).toBe("23503");
  });

  it("uses a non-owner runtime role with CRUD only and rejects CREATE/ALTER", async () => {
    const [role] = await connection.client`select r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
      has_database_privilege(current_user, current_database(), 'CREATE') as db_create,
      has_schema_privilege(current_user, 'public', 'CREATE') as schema_create
      from pg_roles r where r.rolname = current_user`;
    expect(Object.values(role)).toEqual([false, false, false, false, false, false, false]);
    const tables = await connection.client`select c.relname,
      c.relowner = (select oid from pg_roles where rolname = current_user) as runtime_owner,
      c.relrowsecurity, c.relforcerowsecurity,
      (has_table_privilege(current_user, c.oid, 'SELECT') and has_table_privilege(current_user, c.oid, 'INSERT')
        and has_table_privilege(current_user, c.oid, 'UPDATE') and has_table_privilege(current_user, c.oid, 'DELETE')) as crud,
      has_table_privilege(current_user, c.oid, 'TRUNCATE') as truncate,
      has_table_privilege(current_user, c.oid, 'REFERENCES') as refs,
      has_table_privilege(current_user, c.oid, 'TRIGGER') as trigger
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by c.relname`;
    expect(tables.map((table) => table.relname)).toEqual(["accounts", "rate_limits", "sessions", "users", "verifications"]);
    for (const table of tables) {
      expect([table.runtime_owner, table.relrowsecurity, table.relforcerowsecurity, table.truncate, table.refs, table.trigger])
        .toEqual([false, false, false, false, false, false]);
      expect(table.crud).toBe(true);
    }
    // Roll back even if misconfigured credentials unexpectedly permit DDL.
    const createCode = await postgresErrorCode(() => connection.client.begin(async (tx) => {
      await tx`create table public.slice_1b_privilege_probe (id integer)`;
      throw new Error("Runtime DDL unexpectedly permitted; rollback.");
    }));
    expect(createCode).toBe("42501");
    const alterCode = await postgresErrorCode(() => connection.client.begin(async (tx) => {
      await tx`alter table public.users add column slice_1b_privilege_probe integer`;
      throw new Error("Runtime DDL unexpectedly permitted; rollback.");
    }));
    expect(alterCode).toBe("42501");
  });
});
