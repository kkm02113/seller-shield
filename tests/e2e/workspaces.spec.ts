import { randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { requireAuthEnvironment } from "../../src/platform/auth/env";
import { createAuthentication } from "../../src/platform/auth/factory";
import { openTenancyDatabase, withTenancyFixture } from "../helpers/tenancy-fixtures";

const environment = requireAuthEnvironment(process.env), database = openTenancyDatabase();
const auth = createAuthentication(database.db, environment), authContext = await auth.$context;
test.afterAll(() => database.close());
async function signIn(browser: BrowserContext, actor: string) {
  const session = await authContext.internalAdapter.createSession(actor);
  const value = `${session.token}.${await makeSignature(session.token, environment.secret)}`;
  await browser.addCookies([{ name: authContext.authCookies.sessionToken.name, value: encodeURIComponent(value),
    url: environment.baseURL, httpOnly: true, sameSite: "Lax" }]);
}
async function hint(browser: BrowserContext, id: string) {
  await browser.addCookies([{ name: "current_workspace", value: id, url: environment.baseURL, httpOnly: true, sameSite: "Lax" }]);
}

test("zero-member user completes onboarding, creates a workspace and enters the validated app", async ({ page, context }) => {
  await withTenancyFixture(database, async ({ fresh }) => {
    await database.admin`update public.users set name='' where id=${fresh}`;
    await signIn(context, fresh);
    await page.goto("/app"); await expect(page).toHaveURL(`${environment.baseURL}/onboarding`);
    await page.getByLabel("이름", { exact: true }).fill("새 판매자");
    await page.getByRole("button", { name: "이름 저장하고 계속" }).click();
    await expect(page).toHaveURL(`${environment.baseURL}/workspaces/new`);
    const response = await page.reload();
    expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response!.headers()["cache-control"]).toContain("no-store");
    await page.getByLabel("워크스페이스 이름").fill("   ");
    await page.getByRole("button", { name: "워크스페이스 만들기" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("1~80");
    await page.getByLabel("워크스페이스 이름").fill("  내 판매점  ");
    await page.getByRole("button", { name: "워크스페이스 만들기" }).click();
    await expect(page).toHaveURL(`${environment.baseURL}/app`);
    await expect(page.getByRole("main")).toContainText("새 판매자");
    await expect(page.getByRole("main")).toContainText("내 판매점");
    await expect(page.getByRole("main")).toContainText("OWNER");
    const [created] = await database.admin`select id from public.tenants where created_by_user_id=${fresh}`;
    const cookie = (await context.cookies()).find((value) => value.name === "current_workspace")!;
    expect(cookie.value).toBe(created.id); expect(cookie.httpOnly).toBe(true); expect(cookie.secure).toBe(true); expect(cookie.sameSite).toBe("Lax");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(`${environment.baseURL}/sign-in`);
    await page.goto("/app"); await expect(page).toHaveURL(`${environment.baseURL}/sign-in`);
  });
});

test("one workspace auto-enters, ignores a foreign hint and reflects role/revocation changes", async ({ page, context }) => {
  await withTenancyFixture(database, async ({ a, tenantA, tenantB, membershipA }) => {
    await signIn(context, a); await hint(context, tenantB);
    await page.goto("/app"); await expect(page).toHaveURL(`${environment.baseURL}/app`);
    await expect(page.getByRole("main")).toContainText("Workspace A");
    await expect(page.getByRole("main")).not.toContainText("Workspace B");
    await database.admin`update public.memberships set role='OPERATOR' where id=${membershipA}`;
    await page.reload(); await expect(page.getByRole("main")).toContainText("OPERATOR");
    await expect(page.getByRole("main")).not.toContainText("OWNER");
    await database.admin`update public.memberships set status='REVOKED',revoked_at=now() where id=${membershipA}`;
    await hint(context, tenantA); await page.reload();
    await expect(page).toHaveURL(`${environment.baseURL}/workspaces/new`);
    await expect(page.getByRole("main")).not.toContainText("Workspace A");
  });
});

test("multiple memberships require selection and never trust stale/forged selections", async ({ page, context }) => {
  await withTenancyFixture(database, async ({ a, tenantA, tenantB }) => {
    const ownSecond = randomUUID();
    await database.admin`insert into public.tenants (id,name,created_by_user_id) values (${ownSecond},'My second workspace',${a})`;
    await database.admin`insert into public.memberships (id,tenant_id,user_id,role,status)
      values (${randomUUID()},${ownSecond},${a},'REVIEWER','ACTIVE')`;
    await signIn(context, a); await hint(context, randomUUID());
    await page.goto("/app"); await expect(page).toHaveURL(`${environment.baseURL}/workspaces`);
    await expect(page.getByRole("main")).not.toContainText("Workspace B");
    await page.getByLabel("워크스페이스", { exact: true }).evaluate((element, foreign) => {
      const select = element as HTMLSelectElement;
      select.add(new Option("tampered selector", foreign)); select.value = foreign;
    }, tenantB);
    await page.getByRole("button", { name: "선택한 워크스페이스로 이동" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("선택할 수 없습니다");
    expect((await context.cookies()).find((value) => value.name === "current_workspace")).toBeUndefined();
    await page.getByLabel("워크스페이스", { exact: true }).selectOption(ownSecond);
    await page.getByRole("button", { name: "선택한 워크스페이스로 이동" }).click();
    await expect(page).toHaveURL(`${environment.baseURL}/app`);
    await expect(page.getByRole("main")).toContainText("My second workspace");
    await expect(page.getByRole("main")).toContainText("REVIEWER");
    expect((await context.cookies()).find((value) => value.name === "current_workspace")?.value).not.toBe(tenantA);
  });
});
