import { createHash, randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { requireAuthEnvironment } from "../../src/platform/auth/env";
import { createAuthentication } from "../../src/platform/auth/factory";
import { createDatabaseConnection } from "../../src/platform/db/connection";
import { requireDatabaseUrl } from "../../src/platform/db/env";
import { CaptureEmailSender } from "../helpers/capture-email-sender";

const environment = requireAuthEnvironment(process.env);
const connection = createDatabaseConnection(requireDatabaseUrl(process.env), { maxConnections: 2 });
const sender = new CaptureEmailSender();
const auth = createAuthentication(connection.db, environment, sender);
const emails = new Set<string>();
const ips = new Set<string>();
const tokens = new Set<string>();

test.beforeEach(async ({ page }, testInfo) => {
  const ip = `198.19.${testInfo.workerIndex}.${testInfo.testId.charCodeAt(0) + testInfo.retry}`;
  ips.add(ip);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  // Only the outbound email boundary is captured. This POST uses real Better
  // Auth middleware/adapter/PG in the test process; every subsequent request
  // (verification, cookies, guards, name updates and sign-out) uses running Next.
  await page.route("**/api/auth/sign-in/magic-link", async (route) => {
    const request = route.request();
    const response = await auth.handler(new Request(request.url(), {
      method: request.method(), headers: request.headers(), body: request.postData(),
    }));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
});

test.afterEach(async () => {
  for (const email of emails) await connection.client`delete from public.users where email = ${email}`;
  for (const token of tokens) {
    const key = `magic-link:${createHash("sha256").update(token).digest("base64url")}`;
    await connection.client`delete from public.verifications where identifier = ${key}`;
  }
  for (const ip of ips) await connection.client`delete from public.rate_limits where key like ${`${ip}|/%`}`;
  emails.clear(); ips.clear(); tokens.clear(); sender.messages.length = 0;
});
test.afterAll(() => connection.client.end({ timeout: 5 }));

function fixtureEmail() {
  const email = `browser-1b2-${randomUUID()}@example.test`;
  emails.add(email);
  return email;
}
async function requestLink(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByRole("button", { name: "로그인 링크 받기" }).click();
  await expect(page.getByRole("status")).toContainText("발송 요청을 접수");
  const message = sender.messages.findLast((value) => value.to === email)!;
  const link = message.text.match(/https?:\/\/[^\s]+\/auth\/verify#[^\s]+/)![0];
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get("token")!;
  tokens.add(token);
  return { link, token };
}
async function confirm(page: Page, link: string) {
  await page.goto(link);
  await page.getByRole("button", { name: "로그인 계속" }).click();
}

test("initial GET is non-consuming; explicit confirmation creates session, onboarding gates /app, returning user and logout", async ({ page }) => {
  const email = fixtureEmail();
  const { link } = await requestLink(page, email);
  const authRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/auth/")) authRequests.push(url.pathname);
    if (url.origin !== environment.baseURL) externalRequests.push(url.origin);
  });
  const opened = await page.goto(link);
  await expect(page.getByRole("button", { name: "로그인 계속" })).toBeVisible();
  expect(opened!.request().url()).toBe(`${environment.baseURL}/auth/verify`);
  expect(opened!.headers()["referrer-policy"]).toBe("no-referrer");
  expect(opened!.headers()["cache-control"]).toContain("no-store");
  expect(authRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(await connection.client`select id from public.users where email = ${email}`).toHaveLength(0);
  await page.getByRole("button", { name: "로그인 계속" }).click();
  await expect(page).toHaveURL(`${environment.baseURL}/onboarding`);
  await page.goto("/app");
  await expect(page).toHaveURL(`${environment.baseURL}/onboarding`);
  await page.getByLabel("이름", { exact: true }).fill("  판매자 김  ");
  await page.getByRole("button", { name: "이름 저장하고 계속" }).click();
  await expect(page).toHaveURL(`${environment.baseURL}/app`);
  const [user] = await connection.client`select id, name from public.users where email = ${email}`;
  expect(user.name).toBe("판매자 김");
  expect(await connection.client`select id from public.sessions where user_id = ${user.id}`).toHaveLength(1);
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(`${environment.baseURL}/sign-in`);
  expect(await connection.client`select id from public.sessions where user_id = ${user.id}`).toHaveLength(0);
  await page.goto("/app");
  await expect(page).toHaveURL(`${environment.baseURL}/sign-in`);
  const next = await requestLink(page, email);
  await confirm(page, next.link);
  await expect(page).toHaveURL(`${environment.baseURL}/app`);
  expect(await connection.client`select id from public.users where email = ${email}`).toHaveLength(1);
});

test("unfinished returning user stays in onboarding and a reused link fails safely", async ({ page }) => {
  const email = fixtureEmail();
  const first = await requestLink(page, email);
  await confirm(page, first.link);
  await expect(page).toHaveURL(`${environment.baseURL}/onboarding`);
  const response = await page.request.post("/api/auth/sign-out", { headers: { origin: environment.baseURL }, data: {} });
  expect(response.status()).toBe(200);
  const second = await requestLink(page, email);
  await confirm(page, second.link);
  await expect(page).toHaveURL(`${environment.baseURL}/onboarding`);
  await confirm(page, second.link);
  await expect(page).toHaveURL(`${environment.baseURL}/sign-in?error=INVALID_TOKEN`);
  await expect(page.locator(".auth-error[role=alert]")).toContainText("만료되었거나 이미 사용한 링크");
  await page.goto("/app");
  await expect(page).toHaveURL(`${environment.baseURL}/onboarding`);
});

test("malformed fragments and expired tokens never establish a session", async ({ page }) => {
  await page.goto("/auth/verify#token=bad");
  await page.getByRole("button", { name: "로그인 계속" }).click();
  await expect(page.locator(".auth-error[role=alert]")).toHaveText("로그인 링크를 확인할 수 없습니다.");
  const email = fixtureEmail();
  const { link, token } = await requestLink(page, email);
  const key = `magic-link:${createHash("sha256").update(token).digest("base64url")}`;
  await connection.client`update public.verifications set expires_at = now() - interval '1 second' where identifier = ${key}`;
  await confirm(page, link);
  await expect(page).toHaveURL(`${environment.baseURL}/sign-in?error=INVALID_TOKEN`);
  expect(await connection.client`select id from public.users where email = ${email}`).toHaveLength(0);
  await page.goto("/app");
  await expect(page).toHaveURL(`${environment.baseURL}/sign-in`);
});
