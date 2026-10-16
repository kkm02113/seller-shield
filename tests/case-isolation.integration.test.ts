import { randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type postgres from "postgres";
vi.mock("server-only", () => ({}));
import { createAuthentication } from "../src/platform/auth/factory";
import { createTenantBoundary } from "../src/platform/db/tenant-context";
import { cases, claimSnapshots } from "../src/platform/db/schema";
import { openTenancyDatabase, rollbackProbe } from "./helpers/tenancy-fixtures";
import { insertEvent, insertSnapshot, setCaseContext, sourceDigest, sourceText, withCaseFixture } from "./helpers/case-fixtures";

// A one-connection pool makes the connection-reuse assertion physical, not just logical.
const database = openTenancyDatabase(1);
afterAll(() => database.close());
const tables = ["cases", "claim_snapshots", "case_events"];
async function probe(actor: string, tenant: string, operation: (tx: postgres.TransactionSql) => Promise<unknown>) {
  return rollbackProbe(database.client, async (tx) => { await setCaseContext(tx, actor, tenant); return operation(tx); });
}

describe("Case runtime isolation and immutable history", () => {
  it("permits A/A and B/B, rejects A/B and B/A even with exact foreign Case UUIDs", async () => {
    await withCaseFixture(database, async (f) => {
      for (const [actor, tenant, own, foreign] of [[f.a, f.tenantA, f.caseA, f.caseB], [f.b, f.tenantB, f.caseB, f.caseA]]) {
        await probe(actor, tenant, async (tx) => {
          for (const name of tables) {
            const key = name === "cases" ? "id" : "case_id";
            expect(await tx`select id from ${tx(`public.${name}`)} where ${tx(key)} = ${own}`).toHaveLength(1);
            expect(await tx`select id from ${tx(`public.${name}`)} where ${tx(key)} = ${foreign}`).toEqual([]);
          }
          expect(await tx`update public.cases set title = 'foreign mutation' where id = ${foreign} returning id`).toEqual([]);
        });
        const foreignTenant = tenant === f.tenantA ? f.tenantB : f.tenantA;
        await probe(actor, foreignTenant, async (tx) => {
          for (const name of tables) expect(await tx`select id from ${tx(`public.${name}`)}`).toEqual([]);
        });
        // Correct local tenant + exact foreign Case ID passes scope but must fail the composite FK.
        await expect(probe(actor, tenant, (tx) => insertSnapshot(tx, tenant, foreign, actor, 2))).rejects.toMatchObject({ code: "23503" });
        await expect(probe(actor, tenant, (tx) => insertEvent(tx, tenant, foreign, actor))).rejects.toMatchObject({ code: "23503" });
        expect(await probe(actor, tenant, (tx) => insertSnapshot(tx, tenant, own, actor, 2))).toHaveLength(1);
        expect(await probe(actor, tenant, (tx) => insertEvent(tx, tenant, own, actor))).toHaveLength(1);
        // Forging the row's tenant cannot use another member's permissions.
        await expect(probe(actor, tenant, (tx) => insertEvent(tx, foreignTenant, foreign, actor))).rejects.toMatchObject({ code: "42501" });
      }
    });
  });

  it("allows OWNER/OPERATOR normalization without overwriting source and denies REVIEWER writes", async () => {
    await withCaseFixture(database, async (f) => {
      for (const actor of [f.a, f.operator]) await database.client.begin(async (tx) => {
        await setCaseContext(tx, actor, f.tenantA);
        expect(await tx`update public.cases set title = 'Reviewed working title', marketplace = 'source-label',
          external_order_reference = 'working-order', due_at = now(), last_activity_at = now(), updated_at = now()
          where id = ${f.caseA} returning id`).toHaveLength(1);
        expect(await insertSnapshot(tx, f.tenantA, f.caseA, actor, actor === f.a ? 2 : 3)).toHaveLength(1);
        expect(await insertEvent(tx, f.tenantA, f.caseA, actor)).toHaveLength(1);
        expect(await tx`insert into public.cases (tenant_id, title, created_by_user_id)
          values (${f.tenantA}, 'Permitted draft', ${actor}) returning state`).toEqual([{ state: "DRAFT" }]);
      });
      expect(await database.admin`select raw_text, content_sha256, revision from public.claim_snapshots where case_id = ${f.caseA} and revision = 1`)
        .toEqual([{ raw_text: sourceText, content_sha256: sourceDigest, revision: 1 }]);
      await probe(f.reviewer, f.tenantA, async (tx) => {
        for (const name of tables) expect((await tx`select id from ${tx(`public.${name}`)} where tenant_id = ${f.tenantA}`).length).toBeGreaterThan(0);
        expect(await tx`update public.cases set title = 'Reviewer edit' where id = ${f.caseA} returning id`).toEqual([]);
      });
      for (const operation of [
        (tx: postgres.TransactionSql) => tx`insert into public.cases (tenant_id, title, created_by_user_id) values (${f.tenantA}, 'Denied', ${f.reviewer})`,
        (tx: postgres.TransactionSql) => insertSnapshot(tx, f.tenantA, f.caseA, f.reviewer, 4),
        (tx: postgres.TransactionSql) => insertEvent(tx, f.tenantA, f.caseA, f.reviewer),
      ]) await expect(probe(f.reviewer, f.tenantA, operation)).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("denies source/timeline mutation, all physical deletion, ownership and lifecycle writes", async () => {
    await withCaseFixture(database, async (f) => {
      for (const name of ["claim_snapshots", "case_events"]) {
        for (const action of ["update", "delete"]) await expect(probe(f.a, f.tenantA, (tx) => action === "update"
          ? tx`update ${tx(`public.${name}`)} set case_id = ${f.otherCaseA} where case_id = ${f.caseA}`
          : tx`delete from ${tx(`public.${name}`)} where case_id = ${f.caseA}`)).rejects.toMatchObject({ code: "42501" });
      }
      await expect(probe(f.a, f.tenantA, (tx) => tx`delete from public.cases where id = ${f.caseA}`)).rejects.toMatchObject({ code: "42501" });
      for (const values of [{ id: randomUUID() }, { tenant_id: f.tenantB }, { created_by_user_id: f.b },
        { state: "GATHERING_EVIDENCE" }, { state: "CLOSED", closure_disposition: "LEGITIMATE_RETURN" }, { logically_deleted_at: new Date().toISOString() }]) {
        await expect(probe(f.a, f.tenantA, (tx) => tx`update public.cases set ${tx(values)} where id = ${f.caseA}`))
          .rejects.toMatchObject({ code: "42501" });
      }
      for (const state of ["DRAFT", "GATHERING_EVIDENCE", "PACKAGE_READY", "SUBMITTED", "RESOLVED", "CLOSED"]) {
        await expect(probe(f.a, f.tenantA, (tx) => tx`insert into public.cases (tenant_id, title, created_by_user_id, state)
          values (${f.tenantA}, 'No explicit lifecycle write', ${f.a}, ${state})`)).rejects.toMatchObject({ code: "42501" });
      }
      for (const actor of [f.b, null]) {
        await expect(probe(f.a, f.tenantA, (tx) => insertSnapshot(tx, f.tenantA, f.caseA, actor as string, 2))).rejects.toMatchObject({ code: "42501" });
        await expect(probe(f.a, f.tenantA, (tx) => insertEvent(tx, f.tenantA, f.caseA, actor as string))).rejects.toMatchObject({ code: "42501" });
      }
      await expect(probe(f.a, f.tenantA, (tx) => tx`insert into public.cases (tenant_id, title, created_by_user_id)
        values (${f.tenantA}, 'Forged creator', ${f.b})`)).rejects.toMatchObject({ code: "42501" });
      for (const event of ["STATE_CHANGED", "CASE_CLOSED"]) await expect(probe(f.a, f.tenantA, (tx) => tx`insert into public.case_events
        (tenant_id, case_id, event_kind, actor_kind, actor_user_id, occurred_at)
        values (${f.tenantA}, ${f.caseA}, ${event}, 'HUMAN', ${f.a}, now())`)).rejects.toMatchObject({ code: "42501" });
      for (const values of [{ source_job_id: randomUUID() }, { display_metadata: "{}" }]) await expect(probe(f.a, f.tenantA, (tx) => tx`insert into public.case_events
        ${tx({ tenant_id: f.tenantA, case_id: f.caseA, event_kind: "CASE_CREATED", actor_kind: "HUMAN", actor_user_id: f.a, occurred_at: new Date().toISOString(), ...values })}`))
        .rejects.toMatchObject({ code: "42501" });
    });
  });

  it("freezes normalized updates after the early states without disabling full-state storage", async () => {
    await withCaseFixture(database, async (f) => {
      for (const state of ["GATHERING_EVIDENCE", "READY_FOR_REVIEW", "PACKAGE_READY", "SUBMITTED", "RESOLVED", "CLOSED"]) {
        await database.admin`update public.cases set state = ${state}, closure_disposition = ${state === "CLOSED" ? "LEGITIMATE_RETURN" : null} where id = ${f.caseA}`;
        const rows = await probe(f.a, f.tenantA, (tx) => tx`update public.cases set title = 'Late normalization' where id = ${f.caseA} returning id`);
        expect(rows).toHaveLength(state === "GATHERING_EVIDENCE" ? 1 : 0);
      }
    });
  });

  it("denies missing, empty, forged, nonexistent and revoked context for reads and writes", async () => {
    await withCaseFixture(database, async (f) => {
      for (const [actor, tenant] of [["", ""], [f.a, ""], ["", f.tenantA], [f.fresh, f.tenantA],
        [f.a, f.tenantB], [randomUUID(), f.tenantA], [f.a, randomUUID()]]) {
        await probe(actor, tenant, async (tx) => {
          for (const name of tables) expect(await tx`select id from ${tx(`public.${name}`)}`).toEqual([]);
          expect(await tx`update public.cases set title = 'No context' where id = ${f.caseA} returning id`).toEqual([]);
        });
        await expect(probe(actor, tenant, (tx) => tx`insert into public.cases (tenant_id, title, created_by_user_id)
          values (${f.tenantA}, 'Denied context', ${f.a})`)).rejects.toMatchObject({ code: "42501" });
        await expect(probe(actor, tenant, (tx) => insertSnapshot(tx, f.tenantA, f.caseA, f.a, 2))).rejects.toMatchObject({ code: "42501" });
        await expect(probe(actor, tenant, (tx) => insertEvent(tx, f.tenantA, f.caseA, f.a))).rejects.toMatchObject({ code: "42501" });
      }
      for (const [actor, tenant] of [["malformed", f.tenantA], [f.a, "malformed"]]) {
        await expect(probe(actor, tenant, (tx) => tx`select id from public.cases where id = ${f.caseA}`)).rejects.toMatchObject({ code: "22P02" });
      }
      await database.admin`update public.memberships set status = 'REVOKED', revoked_at = now() where id = ${f.membershipA}`;
      await probe(f.a, f.tenantA, async (tx) => {
        for (const name of tables) expect(await tx`select id from ${tx(`public.${name}`)}`).toEqual([]);
      });
      await expect(probe(f.a, f.tenantA, (tx) => insertEvent(tx, f.tenantA, f.caseA, f.a))).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("keeps attribution/history RESTRICTed even for administrative physical deletes", async () => {
    await withCaseFixture(database, async (f) => {
      await expect(rollbackProbe(database.admin, (tx) => tx`delete from public.cases where id = ${f.caseA}`)).rejects.toMatchObject({ code: "23001" });
      // Attribute a historical snapshot/event to a user with no Membership or
      // Tenant creator FK, isolating these NEW identity-deletion constraints.
      for (const name of ["claim_snapshots", "case_events"]) {
        await rollbackProbe(database.admin, async (tx) => {
          const column = name === "claim_snapshots" ? "captured_by_user_id" : "actor_user_id";
          await tx`update ${tx(`public.${name}`)} set ${tx(column)} = ${f.fresh} where case_id = ${f.caseA}`;
          await expect(tx.savepoint((probe) => probe`delete from public.users where id = ${f.fresh}`)).rejects.toMatchObject({ code: "23001" });
        });
      }
    });
  });

  it("uses a verified Better Auth session and rejects forged tenant/role hints", async () => {
    await withCaseFixture(database, async (f) => {
      const secret = "Synthetic-case-session-secret.0123456789!";
      const auth = createAuthentication(database.db, { secret, baseURL: "http://localhost:3000" });
      const context = await auth.$context;
      const session = await context.internalAdapter.createSession(f.a);
      const token = `${session.token}.${await makeSignature(session.token, secret)}`;
      const headers = new Headers({ cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(token)}`,
        "x-actor-id": f.b, "x-tenant-id": f.tenantB, "x-role": "OWNER" });
      const boundary = createTenantBoundary(database.db, async () => (await auth.api.getSession({ headers }))?.user ?? null);
      expect((await boundary.withTenantContext(f.tenantA, ({ tx }) => tx.select().from(cases))).map((row) => row.id).sort())
        .toEqual([f.caseA, f.otherCaseA].sort());
      await expect(boundary.withTenantContext(f.tenantB, ({ tx }) => tx.select().from(cases))).rejects.toThrow("Workspace access denied.");
      const captured = await boundary.withTenantContext(f.tenantA, ({ tx }) => tx.select().from(claimSnapshots));
      expect(captured[0].contentSha256).toEqual(sourceDigest);
      await database.admin`update public.memberships set status = 'REVOKED', revoked_at = now() where id = ${f.membershipA}`;
      let called = false;
      await expect(boundary.withTenantContext(f.tenantA, async () => { called = true; })).rejects.toThrow("Workspace access denied.");
      expect(called).toBe(false);
    });
  });

  it.each(["commit", "rollback"])("leaks no domain visibility after %s on the same backend", async (outcome) => {
    await withCaseFixture(database, async (f) => {
      const boundary = createTenantBoundary(database.db, async () => ({ id: f.a }));
      let pid = 0;
      const operation = boundary.withTenantContext(f.tenantA, async ({ tx }) => {
        const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        pid = row.pid;
        expect(await tx.select().from(cases)).toHaveLength(2);
        if (outcome === "rollback") throw new Error("Requested rollback.");
      });
      if (outcome === "rollback") await expect(operation).rejects.toThrow("Requested rollback."); else await operation;
      const [empty] = await database.client`select pg_backend_pid() as pid,
        nullif(current_setting('app.actor_id', true), '') as actor, nullif(current_setting('app.tenant_id', true), '') as tenant`;
      expect(empty).toEqual({ pid, actor: null, tenant: null });
      for (const name of tables) expect(await database.client`select id from ${database.client(`public.${name}`)}`).toEqual([]);
      const other = createTenantBoundary(database.db, async () => ({ id: f.b }));
      await other.withTenantContext(f.tenantB, async ({ tx }) => {
        const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        expect(row.pid).toBe(pid);
        expect((await tx.select().from(cases)).map((value) => value.id)).toEqual([f.caseB]);
      });
    });
  });
});
