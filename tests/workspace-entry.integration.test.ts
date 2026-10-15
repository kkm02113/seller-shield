import { randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
const request = vi.hoisted(() => ({ headers: new Headers(),
  cookieValues: new Map<string, string>(), cookieOptions: new Map<string, Record<string, unknown>>() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => request.headers, cookies: async () => ({
  get: (name: string) => request.cookieValues.has(name) ? { value: request.cookieValues.get(name) } : undefined,
  set: (name: string, value: string, options: Record<string, unknown>) => {
    request.cookieValues.set(name, value); request.cookieOptions.set(name, options);
  },
}) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`Redirect:${path}`); },
  unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message.startsWith("Redirect:")) throw error; },
}));
import { getAuth } from "../src/platform/auth/auth";
import { db } from "../src/platform/db/client";
import { tenantBoundary } from "../src/modules/identity/application/context";
import { createWorkspaceService } from "../src/modules/identity/application/workspaces";
import { createWorkspaceFlow } from "../src/modules/identity/application/workspace-flow";
import { openTenancyDatabase, withTenancyFixture } from "./helpers/tenancy-fixtures";
import { getWorkspaceEntry } from "../src/app/workspaces/server";
import { createWorkspaceAction, selectWorkspaceAction } from "../src/app/workspaces/actions";

const database = openTenancyDatabase();
const secret = "Synthetic-workspace-entry-secret.0123456789!";
vi.stubEnv("BETTER_AUTH_SECRET", secret);
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
const auth = await getAuth(), context = await auth.$context;
const service = createWorkspaceService(tenantBoundary), flow = createWorkspaceFlow(service);
async function signIn(actor: string) {
  request.cookieValues.clear(); request.cookieOptions.clear();
  const session = await context.internalAdapter.createSession(actor);
  const signed = `${session.token}.${await makeSignature(session.token, secret)}`;
  request.headers = new Headers({ cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(signed)}` });
}
afterAll(async () => { await Promise.all([database.close(), db.$client.end({ timeout: 5 })]); vi.unstubAllEnvs(); });

describe("workspace entry through real production session and PostgreSQL", () => {
  it("resolves zero/one/multiple ACTIVE memberships using the existing server boundary", async () => {
    await withTenancyFixture(database, async ({ fresh, a, tenantA, tenantB }) => {
      await signIn(fresh);
      expect(await flow.resolve()).toEqual({ kind: "create" });
      await signIn(a);
      expect(await flow.resolve()).toEqual({ kind: "ready", workspace: { id: tenantA, name: "Workspace A", role: "OWNER" } });
      await database.admin`insert into public.memberships (id,tenant_id,user_id,role,status)
        values (${randomUUID()}, ${tenantB}, ${a}, 'REVIEWER', 'ACTIVE')`;
      const result = await flow.resolve();
      expect(result.kind).toBe("select");
      if (result.kind === "select") expect(result.workspaces.map((item) => item.id).sort()).toEqual([tenantA, tenantB].sort());
      expect(await flow.resolve(tenantB)).toEqual({ kind: "ready", workspace: { id: tenantB, name: "Workspace B", role: "REVIEWER" } });
    });
  });
  it("denies exact foreign, nonexistent and revoked tenant UUIDs identically", async () => {
    await withTenancyFixture(database, async ({ a, tenantA, tenantB, membershipA }) => {
      await signIn(a);
      for (const id of [tenantB, randomUUID(), "forged"]) {
        await expect(service.getWorkspace(id)).rejects.toThrow("Workspace access denied.");
        expect(await flow.resolve(id)).toEqual({ kind: "ready", workspace: { id: tenantA, name: "Workspace A", role: "OWNER" } });
      }
      await database.admin`update public.memberships set status='REVOKED',revoked_at=now() where id=${membershipA}`;
      await expect(service.getWorkspace(tenantA)).rejects.toThrow("Workspace access denied.");
      expect(await flow.resolve(tenantA)).toEqual({ kind: "create" });
    });
  });
  it("reads changed role from the locked Membership on every request", async () => {
    await withTenancyFixture(database, async ({ a, tenantA, membershipA }) => {
      await signIn(a);
      expect((await service.getWorkspace(tenantA)).role).toBe("OWNER");
      await database.admin`update public.memberships set role='OPERATOR' where id=${membershipA}`;
      request.headers.set("x-role", "OWNER");
      expect(await flow.resolve(tenantA)).toEqual({ kind: "ready", workspace: { id: tenantA, name: "Workspace A", role: "OPERATOR" } });
    });
  });
});

describe("workspace UI server actions with real authentication and bootstrap", () => {
  it("requires authentication and completed name onboarding before UI reads or mutations", async () => {
    request.headers = new Headers();
    await expect(getWorkspaceEntry()).rejects.toThrow("Redirect:/sign-in");
    await withTenancyFixture(database, async ({ fresh }) => {
      await signIn(fresh);
      await database.admin`update public.users set name='' where id=${fresh}`;
      const form = new FormData(); form.set("name", "Must not create");
      await expect(getWorkspaceEntry()).rejects.toThrow("Redirect:/onboarding");
      await expect(createWorkspaceAction({ error: "" }, form)).rejects.toThrow("Redirect:/onboarding");
      expect(await database.admin`select id from public.tenants where created_by_user_id=${fresh}`).toEqual([]);
    });
  });
  it("validates names then uses the approved bootstrap with server attribution and an identifier-only cookie", async () => {
    await withTenancyFixture(database, async ({ fresh, b, tenantB }) => {
      await signIn(fresh);
      const form = new FormData(); form.set("name", "   ");
      expect((await createWorkspaceAction({ error: "" }, form)).error).toContain("1~80");
      expect(await database.admin`select id from public.tenants where created_by_user_id=${fresh}`).toEqual([]);
      form.set("name", "  새 워크스페이스  "); form.set("owner", b); form.set("tenantId", tenantB); form.set("role", "REVIEWER");
      await expect(createWorkspaceAction({ error: "" }, form)).rejects.toThrow("Redirect:/app");
      const [created] = await database.admin`select id,name,created_by_user_id from public.tenants where created_by_user_id=${fresh}`;
      expect(created.name).toBe("새 워크스페이스"); expect(created.id).not.toBe(tenantB);
      expect(await service.getWorkspace(created.id)).toEqual({ id: created.id, name: "새 워크스페이스", role: "OWNER" });
      expect(request.cookieValues.get("current_workspace")).toBe(created.id);
      expect(request.cookieOptions.get("current_workspace")).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    });
  });
  it("recovers duplicate first-workspace submissions through current server authorization", async () => {
    await withTenancyFixture(database, async ({ fresh }) => {
      await signIn(fresh);
      const form = new FormData(); form.set("name", "One workspace");
      const outcomes = await Promise.allSettled([createWorkspaceAction({ error: "" }, form), createWorkspaceAction({ error: "" }, form)]);
      for (const outcome of outcomes) {
        expect(outcome.status).toBe("rejected");
        if (outcome.status === "rejected") expect(outcome.reason.message).toBe("Redirect:/app");
      }
      expect(await database.admin`select id from public.tenants where created_by_user_id=${fresh}`).toHaveLength(1);
      expect(await database.admin`select id from public.memberships where user_id=${fresh} and status='ACTIVE'`).toHaveLength(1);
    });
  });
  it("denies forged selection generically and clears the convenience hint", async () => {
    await withTenancyFixture(database, async ({ a, tenantA, tenantB }) => {
      await signIn(a);
      for (const tenantId of [tenantB, randomUUID(), "bad"]) {
        request.cookieValues.set("current_workspace", tenantA);
        const form = new FormData(); form.set("tenantId", tenantId); form.set("role", "OWNER");
        const result = await selectWorkspaceAction({ error: "" }, form);
        expect(result.error).toBe("워크스페이스를 선택할 수 없습니다. 목록을 새로 확인해주세요.");
        expect(result.error).not.toContain(tenantId);
        expect(request.cookieValues.get("current_workspace")).toBe("");
        expect(request.cookieOptions.get("current_workspace")?.maxAge).toBe(0);
      }
      const form = new FormData(); form.set("tenantId", tenantA);
      await expect(selectWorkspaceAction({ error: "" }, form)).rejects.toThrow("Redirect:/app");
      expect((await getWorkspaceEntry()).entry).toEqual({ kind: "ready", workspace: { id: tenantA, name: "Workspace A", role: "OWNER" } });
    });
  });
});
