import type { EmailMessage } from "../email/sender.ts";
import { AUTH_CALLBACK, AUTH_ERROR, tokenSchema } from "./validation.ts";

export function confirmationURL(origin: string, token: string): string {
  const url = new URL("/auth/verify", origin);
  url.hash = new URLSearchParams({ token: tokenSchema.parse(token) }).toString();
  return url.toString();
}

export function verificationDestination(fragment: string): string {
  const parameters = new URLSearchParams(fragment.replace(/^#/, ""));
  const result = tokenSchema.safeParse(parameters.get("token"));
  if (!result.success || parameters.getAll("token").length !== 1) {
    throw new Error("로그인 링크를 확인할 수 없습니다.");
  }
  const query = new URLSearchParams({ token: result.data, callbackURL: AUTH_CALLBACK,
    newUserCallbackURL: AUTH_CALLBACK, errorCallbackURL: AUTH_ERROR });
  return `/api/auth/magic-link/verify?${query}`;
}

export function buildMagicLinkEmail(email: string, origin: string, token: string): EmailMessage {
  const url = confirmationURL(origin, token);
  const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return {
    to: email, subject: "셀러방패 로그인 링크",
    text: `셀러방패 로그인\n\n아래 링크에서 로그인 계속 버튼을 눌러주세요.\n${url}\n\n링크는 5분 동안 한 번 사용할 수 있습니다. 요청하지 않았다면 이 메일을 무시해주세요.`,
    html: `<html lang="ko"><body><h1>셀러방패 로그인</h1><p><a href="${escaped}">로그인 확인 화면 열기</a></p><p>화면에서 로그인 계속 버튼을 눌러주세요. 링크는 5분 동안 한 번 사용할 수 있습니다.</p><p>요청하지 않았다면 이 메일을 무시해주세요.</p></body></html>`,
  };
}
