import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { withTenancyFixture, type TenancyTestDatabase } from "./tenancy-fixtures";

export const sourceText = "Synthetic original source — not independently verified evidence.";
export const sourceDigest = createHash("sha256").update(sourceText).digest();
export async function setCaseContext(tx: postgres.TransactionSql, actor: string, tenant: string) {
  await tx`select set_config('app.actor_id', ${actor}, true), set_config('app.tenant_id', ${tenant}, true)`;
}
export async function insertSnapshot(tx: postgres.TransactionSql, tenant: string, caseId: string, actor: string, revision = 1) {
  return tx`insert into public.claim_snapshots (tenant_id, case_id, revision, source_type, raw_text,
    content_sha256, captured_at, captured_by_user_id, capture_method)
    values (${tenant}, ${caseId}, ${revision}, 'MANUAL_SOURCE', ${sourceText}, ${sourceDigest}, now(), ${actor}, 'MANUAL_CAPTURE') returning id`;
}
export async function insertEvent(tx: postgres.TransactionSql, tenant: string, caseId: string, actor: string) {
  return tx`insert into public.case_events (tenant_id, case_id, event_kind, actor_kind, actor_user_id, occurred_at)
    values (${tenant}, ${caseId}, 'CASE_CREATED', 'HUMAN', ${actor}, now()) returning id`;
}
export async function withCaseFixture<T>(database: TenancyTestDatabase,
  operation: (fixture: { a: string; b: string; operator: string; reviewer: string; fresh: string;
    tenantA: string; tenantB: string; membershipA: string; caseA: string; caseB: string; otherCaseA: string }) => Promise<T>) {
  return withTenancyFixture(database, async (tenancy) => {
    const fixture = { ...tenancy, caseA: randomUUID(), caseB: randomUUID(), otherCaseA: randomUUID() };
    try {
      for (const [actor, tenant, id] of [[fixture.a, fixture.tenantA, fixture.caseA],
        [fixture.b, fixture.tenantB, fixture.caseB], [fixture.a, fixture.tenantA, fixture.otherCaseA]]) {
        await database.client.begin(async (tx) => {
          await setCaseContext(tx, actor, tenant);
          await tx`insert into public.cases (id, tenant_id, title, created_by_user_id) values (${id}, ${tenant}, 'Synthetic case', ${actor})`;
          await insertSnapshot(tx, tenant, id, actor);
          await insertEvent(tx, tenant, id, actor);
        });
      }
      return await operation(fixture);
    } finally {
      // Cleanup only this fixture's random tenants, in reverse FK order. No
      // production deletion path, TRUNCATE, RLS disable or broad cleanup.
      await database.admin.begin(async (tx) => {
        const ids = [fixture.tenantA, fixture.tenantB];
        await tx`delete from public.case_events where tenant_id in ${tx(ids)}`;
        await tx`delete from public.claim_snapshots where tenant_id in ${tx(ids)}`;
        await tx`delete from public.cases where tenant_id in ${tx(ids)}`;
      });
    }
  });
}
