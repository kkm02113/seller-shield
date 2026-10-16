import { afterAll, describe, expect, it } from "vitest";
import { openTenancyDatabase, rollbackProbe, withTenancyFixture } from "./helpers/tenancy-fixtures";

const database = openTenancyDatabase();
afterAll(() => database.close());

describe("runtime tenancy RLS policies", () => {
  it("has exactly the approved tenancy plus Case policies and retains ENABLE/FORCE RLS", async () => {
    const policies = await database.owner`select policyname from pg_policies where schemaname = 'public' order by policyname`;
    expect(policies.map((row) => row.policyname)).toEqual([
      "case_events_domain_insert", "case_events_member_select", "cases_member_select", "cases_operator_insert", "cases_operator_update",
      "claim_snapshots_member_select", "claim_snapshots_operator_insert",
      "memberships_actor_lock", "memberships_actor_select", "memberships_bootstrap_insert",
      "tenants_bootstrap_insert", "tenants_member_select", "tenants_owner_update",
    ]);
    const flags = await database.owner`select relrowsecurity, relforcerowsecurity from pg_class
      where oid in ('public.tenants'::regclass, 'public.memberships'::regclass)`;
    expect(flags.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });
  it("permits actor-only own ACTIVE discovery but excludes the exact foreign tenant UUID", async () => {
    await withTenancyFixture(database, async ({ a, b, tenantA, tenantB }) => {
      for (const [actor, own, foreign] of [[a, tenantA, tenantB], [b, tenantB, tenantA]]) {
        await rollbackProbe(database.client, async (tx) => {
          await tx`select set_config('app.actor_id', ${actor}, true), set_config('app.tenant_id', '', true)`;
          expect((await tx`select id from public.tenants`).map((row) => row.id)).toEqual([own]);
          expect(await tx`select id from public.tenants where id = ${foreign}`).toEqual([]);
          expect((await tx`select user_id from public.memberships`).map((row) => row.user_id)).toEqual([actor]);
        });
      }
    });
  });
  it("allows FOR SHARE while a membership UPDATE(id=id) cannot pass WITH CHECK", async () => {
    await withTenancyFixture(database, async ({ a, tenantA, membershipA }) => {
      await rollbackProbe(database.client, async (tx) => {
        await tx`select set_config('app.actor_id', ${a}, true)`;
        expect(await tx`select id from public.memberships where tenant_id = ${tenantA} for share`)
          .toEqual([{ id: membershipA }]);
      });
      await expect(rollbackProbe(database.client, async (tx) => {
        await tx`select set_config('app.actor_id', ${a}, true)`;
        await tx`update public.memberships set id = id where id = ${membershipA}`;
      })).rejects.toMatchObject({ code: "42501" });
    });
  });
  it("denies no-context reads, revoked creator access and writes without selected tenant", async () => {
    await withTenancyFixture(database, async ({ a, tenantA, membershipA }) => {
      expect(await database.client`select id from public.tenants`).toEqual([]);
      expect(await database.client`select id from public.memberships`).toEqual([]);
      await rollbackProbe(database.client, async (tx) => {
        await tx`select set_config('app.actor_id', ${a}, true), set_config('app.tenant_id', '', true)`;
        expect(await tx`update public.tenants set name = 'Unauthorized' where id = ${tenantA} returning id`).toEqual([]);
      });
      await database.admin`update public.memberships set status = 'REVOKED', revoked_at = now() where id = ${membershipA}`;
      await rollbackProbe(database.client, async (tx) => {
        await tx`select set_config('app.actor_id', ${a}, true)`;
        expect(await tx`select id from public.tenants where id = ${tenantA}`).toEqual([]);
      });
    });
  });
  it("allows selected OWNER rename but neither OPERATOR nor REVIEWER nor a forged foreign selection", async () => {
    await withTenancyFixture(database, async ({ a, operator, reviewer, tenantA, tenantB }) => {
      for (const [actor, tenant, permitted] of [[a, tenantA, true], [operator, tenantA, false],
        [reviewer, tenantA, false], [a, tenantB, false]] as const) {
        await rollbackProbe(database.client, async (tx) => {
          await tx`select set_config('app.actor_id', ${actor}, true), set_config('app.tenant_id', ${tenant}, true)`;
          const rows = await tx`update public.tenants set name = 'Authorized rename', updated_at = now()
            where id = ${tenant} returning id`;
          expect(rows).toEqual(permitted ? [{ id: tenant }] : []);
        });
      }
    });
  });
  it("does not turn authenticated context into INSERT/DELETE, creator/id mutation or role/status UPDATE privileges", async () => {
    await withTenancyFixture(database, async ({ a, tenantA, membershipA }) => {
      for (const mutation of [
        "update public.memberships set role = 'OWNER'", "update public.memberships set status = 'ACTIVE'",
        "update public.tenants set created_by_user_id = created_by_user_id", "update public.tenants set id = id",
        "delete from public.tenants", "delete from public.memberships",
        "insert into public.tenants (name, created_by_user_id) values ('Forbidden', null)",
        "insert into public.memberships (tenant_id, user_id, role, status) values (null, null, 'OWNER', 'ACTIVE')",
      ]) {
        await expect(rollbackProbe(database.client, async (tx) => {
          await tx`select set_config('app.actor_id', ${a}, true), set_config('app.tenant_id', ${tenantA}, true)`;
          await tx.unsafe(mutation);
        })).rejects.toMatchObject({ code: "42501" });
      }
      expect((await database.admin`select role, status from public.memberships where id = ${membershipA}`)[0])
        .toEqual({ role: "OWNER", status: "ACTIVE" });
    });
  });
  it("rejects malformed GUCs and cannot turn row_security off into a bypass", async () => {
    await withTenancyFixture(database, async ({ a, tenantA }) => {
      await expect(rollbackProbe(database.client, async (tx) => {
        await tx`select set_config('app.actor_id', 'invalid', true)`;
        await tx`select id from public.memberships`;
      })).rejects.toMatchObject({ code: "22P02" });
      await expect(rollbackProbe(database.client, async (tx) => {
        await tx`select set_config('app.actor_id', ${a}, true), set_config('app.tenant_id', 'invalid', true)`;
        await tx`update public.tenants set name = 'Forbidden' where id = ${tenantA}`;
      })).rejects.toMatchObject({ code: "22P02" });
      await expect(rollbackProbe(database.client, async (tx) => {
        await tx`set local row_security = off`;
        await tx`select id from public.tenants where id = ${tenantA}`;
      })).rejects.toMatchObject({ code: "42501" });
    });
  });
});
