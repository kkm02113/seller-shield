import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createTenantBoundary } from "../src/platform/db/tenant-context";
import { openTenancyDatabase, rollbackProbe } from "./helpers/tenancy-fixtures";
import { insertSnapshot, setCaseContext, sourceDigest, sourceText, withCaseFixture } from "./helpers/case-fixtures";

const database = openTenancyDatabase(4);
afterAll(() => database.close());
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Case-local revisions and transaction atomicity", () => {
  it("does not let a global DB query inherit the active domain transaction context", async () => {
    await withCaseFixture(database, async (f) => {
      const boundary = createTenantBoundary(database.db, async () => ({ id: f.a }));
      await boundary.withTenantContext(f.tenantA, async ({ tx }) => {
        const [scoped] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        const [global] = await database.db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        expect(global.pid).not.toBe(scoped.pid);
        expect(await tx.execute(sql`select id from public.cases where id = ${f.caseA}`)).toEqual([{ id: f.caseA }]);
        expect(await database.db.execute(sql`select id from public.cases`)).toEqual([]);
        expect(await database.db.execute(sql`select id from public.claim_snapshots`)).toEqual([]);
        expect(await database.db.execute(sql`select id from public.case_events`)).toEqual([]);
      });
    });
  });
  it("blocks a concurrent duplicate on a different backend then rejects it with 23505", async () => {
    await withCaseFixture(database, async (f) => {
      const entered = deferred(), release = deferred(), secondReady = deferred();
      let firstPid = 0, secondPid = 0;
      const first = database.client.begin(async (tx) => {
        await setCaseContext(tx, f.a, f.tenantA);
        [{ pid: firstPid }] = await tx`select pg_backend_pid() as pid`;
        await insertSnapshot(tx, f.tenantA, f.caseA, f.a, 7);
        entered.resolve();
        await release.promise;
      });
      // If the first query regresses, fail immediately instead of waiting for a
      // rendezvous that can no longer be signaled.
      await Promise.race([entered.promise, first.then(() => { throw new Error("First insert did not rendezvous."); })]);
      const second = database.client.begin(async (tx) => {
        await setCaseContext(tx, f.a, f.tenantA);
        await tx`set local lock_timeout = '3s'`;
        [{ pid: secondPid }] = await tx`select pg_backend_pid() as pid`;
        secondReady.resolve();
        return insertSnapshot(tx, f.tenantA, f.caseA, f.a, 7);
      }).then(() => ({ code: "unexpected-success" }), (error: { code: string }) => ({ code: error.code }));
      try {
        await Promise.race([secondReady.promise, second.then(() => { throw new Error("Second insert did not rendezvous."); })]);
        expect(secondPid).not.toBe(firstPid);
        let blocked = false;
        const deadline = Date.now() + 2_000;
        while (Date.now() < deadline) {
          const [row] = await database.admin`select wait_event_type, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = ${secondPid}`;
          if (row?.wait_event_type === "Lock" && row.blockers.includes(firstPid)) { blocked = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(blocked).toBe(true);
        release.resolve();
        await first;
        expect(await second).toEqual({ code: "23505" });
        expect(await database.admin`select count(*)::integer as count from public.claim_snapshots
          where tenant_id = ${f.tenantA} and case_id = ${f.caseA} and revision = 7`).toEqual([{ count: 1 }]);
      } finally { release.resolve(); await Promise.allSettled([first, second]); }
    });
  });

  it("allows independent Cases to start at revision 1 and orders source revisions per Case", async () => {
    await withCaseFixture(database, async (f) => {
      await rollbackProbe(database.client, async (tx) => {
        await setCaseContext(tx, f.a, f.tenantA);
        expect(await tx`select case_id from public.claim_snapshots where revision = 1 order by case_id`)
          .toEqual([f.caseA, f.otherCaseA].sort().map((case_id) => ({ case_id })));
        await insertSnapshot(tx, f.tenantA, f.caseA, f.a, 4);
        await insertSnapshot(tx, f.tenantA, f.caseA, f.a, 2);
        expect(await tx`select revision from public.claim_snapshots where tenant_id = ${f.tenantA} and case_id = ${f.caseA}
          order by revision desc limit 1`).toEqual([{ revision: 4 }]);
      });
    });
  });

  it("rolls back Case, original snapshot and creation event together through the scoped transaction", async () => {
    await withCaseFixture(database, async (f) => {
      const id = randomUUID(), snapshotId = randomUUID(), eventId = randomUUID();
      const boundary = createTenantBoundary(database.db, async () => ({ id: f.a }));
      await expect(boundary.withTenantContext(f.tenantA, async ({ tx, actorId, tenantId }) => {
        // Drizzle's full-schema .insert emits even omitted columns as DEFAULT.
        // Keep protected columns out of SQL entirely; never widen ACLs for it.
        await tx.execute(sql`insert into public.cases (id, tenant_id, title, created_by_user_id)
          values (${id}, ${tenantId}, 'Rollback fixture', ${actorId})`);
        await tx.execute(sql`insert into public.claim_snapshots (id, tenant_id, case_id, revision, source_type,
          raw_text, raw_payload, content_sha256, captured_at, captured_by_user_id, capture_method)
          values (${snapshotId}, ${tenantId}, ${id}, 1, 'MANUAL_SOURCE', ${sourceText}, '{"synthetic":true}'::jsonb,
            ${sourceDigest}, now(), ${actorId}, 'MANUAL_CAPTURE')`);
        await tx.execute(sql`insert into public.case_events (id, tenant_id, case_id, event_kind, actor_kind, actor_user_id, occurred_at)
          values (${eventId}, ${tenantId}, ${id}, 'CASE_CREATED', 'HUMAN', ${actorId}, now())`);
        throw new Error("Fail after all three inserts.");
      })).rejects.toThrow("Fail after all three inserts.");
      expect(await database.admin`select id from public.cases where id = ${id}`).toEqual([]);
      expect(await database.admin`select id from public.claim_snapshots where id = ${snapshotId}`).toEqual([]);
      expect(await database.admin`select id from public.case_events where id = ${eventId}`).toEqual([]);
    });
  });
});
