import { createHash, randomUUID } from "node:crypto";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createAuthentication } from "../src/platform/auth/factory";
import { createDatabaseConnection } from "../src/platform/db/connection";
import { requireDatabaseUrl } from "../src/platform/db/env";
import { loadDatabaseEnvironment } from "../src/platform/db/local-env";
import { CaptureEmailSender } from "./helpers/capture-email-sender";

loadDatabaseEnvironment();
const connection = createDatabaseConnection(requireDatabaseUrl(process.env), { maxConnections: 4 });
const environment = { secret: "Synthetic-Magic-Link-secret.0123456789!", baseURL: "http://localhost:3000" };
const sender = new CaptureEmailSender();
const auth = createAuthentication(connection.db, environment, sender);
const secondAuth = createAuthentication(connection.db, environment, sender);
const emails = new Set<string>();
const ips = new Set<string>();
const tokens = new Set<string>();

function fixture() {
  const email = `slice-1b2-${randomUUID()}@example.test`;
  const bytes = new Uint8Array(2); crypto.getRandomValues(bytes);
  const ip = `198.18.${bytes[0]}.${bytes[1]}`;
  emails.add(email); ips.add(ip);
  return { email, ip };
}
function request(path: string, ip: string, body?: unknown, cookie?: string) {
  return new Request(`${environment.baseURL}/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: environment.baseURL, "x-forwarded-for": ip,
      "content-type": "application/json", "user-agent": "Synthetic auth integration", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function capturedToken(email: string) {
  const message = sender.messages.findLast((candidate) => candidate.to === email);
  expect(message).toBeDefined();
  const link = message!.text.match(/http:\/\/localhost:3000\/auth\/verify#[^\s]+/)?.[0];
  expect(link).toBeDefined();
  const token = new URLSearchParams(new URL(link!).hash.slice(1)).get("token")!;
  tokens.add(token);
  return token;
}
function identifier(token: string) {
  return `magic-link:${createHash("sha256").update(token).digest("base64url")}`;
}
function verify(token: string, ip: string, instance = auth) {
  return instance.handler(request(`/magic-link/verify?token=${token}&callbackURL=%2Fauth%2Fcallback&newUserCallbackURL=%2Fauth%2Fcallback&errorCallbackURL=%2Fsign-in`, ip));
}
function cookie(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

afterEach(async () => {
  for (const email of emails) await connection.client`delete from public.users where email = ${email}`;
  for (const token of tokens) await connection.client`delete from public.verifications where identifier = ${identifier(token)}`;
  // Rate-limit keys are upstream IP/path keys; remove only reserved synthetic IPs.
  for (const ip of ips) await connection.client`delete from public.rate_limits where key like ${`${ip}|/%`}`;
  emails.clear(); ips.clear(); tokens.clear(); sender.messages.length = 0;
});
afterAll(() => connection.client.end({ timeout: 5 }));

describe("Magic Link HTTP ↔ real PostgreSQL with captured email", () => {
  it("sends a non-consuming fragment link, hashes storage and creates a blank-name verified User + DB session", async () => {
    const { email, ip } = fixture();
    const sent = await auth.handler(request("/sign-in/magic-link", ip, { email }));
    expect(sent.status).toBe(200);
    expect(await sent.json()).toEqual({ status: true });
    const token = capturedToken(email);
    const rows = await connection.client`select identifier, value, expires_at from public.verifications where identifier = ${identifier(token)}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].identifier).not.toContain(token);
    expect(rows[0].value).not.toContain(token);
    expect(new Date(rows[0].expires_at).getTime() - Date.now()).toBeGreaterThan(290_000);
    expect(await connection.client`select id from public.users where email = ${email}`).toHaveLength(0);
    const verified = await verify(token, ip);
    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe("http://localhost:3000/auth/callback");
    expect(verified.headers.get("set-cookie")).toContain("HttpOnly");
    expect(verified.headers.get("set-cookie")).toContain("SameSite=Lax");
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookie(verified) }) });
    expect(session?.user.email).toBe(email);
    expect(session?.user.name).toBe("");
    expect(session?.user.emailVerified).toBe(true);
    const [user] = await connection.client`select id from public.users where email = ${email}`;
    expect(await connection.client`select id from public.sessions where user_id = ${user.id}`).toHaveLength(1);
    const reused = await verify(token, ip);
    expect(reused.headers.get("location")).toBe("http://localhost:3000/sign-in?error=INVALID_TOKEN");
  });

  it("validates authenticated name updates without letting pre-login name bypass onboarding", async () => {
    const { email, ip } = fixture();
    const rejected = await auth.handler(request("/sign-in/magic-link", ip, { email, name: "Bypass" }));
    expect(rejected.status).toBe(400);
    expect(sender.messages).toHaveLength(0);
    await auth.handler(request("/sign-in/magic-link", ip, { email }));
    const verified = await verify(capturedToken(email), ip);
    const sessionCookie = cookie(verified);
    expect((await auth.handler(request("/update-user", ip, { name: " \t " }, sessionCookie))).status).toBe(400);
    expect((await auth.handler(request("/update-user", ip, { name: "x".repeat(81) }, sessionCookie))).status).toBe(400);
    expect((await auth.handler(request("/update-user", ip, { name: "  판매자 김  " }, sessionCookie))).status).toBe(200);
    expect((await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie }) }))?.user.name).toBe("판매자 김");
    expect((await auth.handler(request("/update-user", ip, { name: "Other user" }))).status).toBe(401);
    await auth.handler(request("/sign-in/magic-link", ip, { email }));
    const again = await verify(capturedToken(email), ip);
    expect((await auth.api.getSession({ headers: new Headers({ cookie: cookie(again) }) }))?.user.name).toBe("판매자 김");
    expect(await connection.client`select id from public.users where email = ${email}`).toHaveLength(1);
  });

  it("rejects expired links without creating an identity", async () => {
    const { email, ip } = fixture();
    await auth.handler(request("/sign-in/magic-link", ip, { email }));
    const token = capturedToken(email);
    await connection.client`update public.verifications set expires_at = now() - interval '1 second' where identifier = ${identifier(token)}`;
    expect((await verify(token, ip)).headers.get("location")).toBe("http://localhost:3000/sign-in?error=INVALID_TOKEN");
    expect(await connection.client`select id from public.users where email = ${email}`).toHaveLength(0);
  });

  it("allows only one concurrent token redemption across independent authentication instances", async () => {
    const { email, ip } = fixture();
    await auth.handler(request("/sign-in/magic-link", ip, { email }));
    const token = capturedToken(email);
    const responses = await Promise.all([verify(token, ip), verify(token, ip, secondAuth), verify(token, ip), verify(token, ip, secondAuth)]);
    expect(responses.filter((response) => response.headers.get("location") === "http://localhost:3000/auth/callback")).toHaveLength(1);
    expect(responses.filter((response) => response.headers.get("location") === "http://localhost:3000/sign-in?error=INVALID_TOKEN")).toHaveLength(3);
    const [user] = await connection.client`select id from public.users where email = ${email}`;
    expect(await connection.client`select id from public.sessions where user_id = ${user.id}`).toHaveLength(1);
  });

  it("enforces the shared built-in 5/60s DB limit for parallel HTTP requests", async () => {
    const { email, ip } = fixture();
    const responses = await Promise.all(Array.from({ length: 16 }, (_, index) =>
      (index % 2 ? auth : secondAuth).handler(request("/sign-in/magic-link", ip, { email }))));
    for (const message of sender.messages) {
      const token = new URLSearchParams(new URL(message.text.match(/http:\/\/localhost:3000\/auth\/verify#[^\s]+/)![0]).hash.slice(1)).get("token")!;
      tokens.add(token);
    }
    expect(responses.filter((response) => response.status === 200)).toHaveLength(5);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(11);
    expect(sender.messages).toHaveLength(5);
    expect(responses.find((response) => response.status === 429)?.headers.get("x-retry-after")).toBeTruthy();
    const [row] = await connection.client`select count from public.rate_limits where key = ${`${ip}|/sign-in/magic-link`}`;
    expect(row.count).toBe(5);
  });

  it("rejects unsafe callbacks and fails mail delivery without issuing a session or claiming success", async () => {
    const { email, ip } = fixture();
    const unsafe = await auth.handler(request("/sign-in/magic-link", ip, { email, callbackURL: "https://evil.example" }));
    expect(unsafe.status).toBe(400);
    expect(sender.messages).toHaveLength(0);
    const failing = createAuthentication(connection.db, environment, { async send(message) {
      await sender.send(message); throw new Error("private provider payload");
    } });
    const failed = await failing.handler(request("/sign-in/magic-link", ip, { email }));
    capturedToken(email);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private provider payload");
    expect(await connection.client`select id from public.users where email = ${email}`).toHaveLength(0);
  });
});
