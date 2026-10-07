import { z } from "zod";

export const AUTH_CALLBACK = "/auth/callback";
export const AUTH_ERROR = "/sign-in";
export const tokenSchema = z.string().min(20).max(512).regex(/^[A-Za-z0-9_-]+$/);
const callbacks = {
  callbackURL: z.literal(AUTH_CALLBACK).optional(),
  newUserCallbackURL: z.literal(AUTH_CALLBACK).optional(),
  errorCallbackURL: z.literal(AUTH_ERROR).optional(),
};
const bodySchema = z.object({ email: z.string().trim().pipe(z.email()).transform((email) => email.toLowerCase()), ...callbacks }).strict();
const querySchema = z.object({ token: tokenSchema, ...callbacks }).strict();

export function parseMagicLinkBody(input: unknown) {
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid authentication request.");
  return { email: parsed.data.email, callbackURL: AUTH_CALLBACK, newUserCallbackURL: AUTH_CALLBACK, errorCallbackURL: AUTH_ERROR };
}
export function parseMagicLinkQuery(input: unknown) {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid authentication request.");
  return { token: parsed.data.token, callbackURL: AUTH_CALLBACK, newUserCallbackURL: AUTH_CALLBACK, errorCallbackURL: AUTH_ERROR };
}
export function parseName(input: unknown): string {
  const parsed = z.string().trim().min(1).max(80).safeParse(input);
  if (!parsed.success) throw new Error("이름은 공백을 제외하고 1~80자로 입력해주세요.");
  return parsed.data;
}
export function onboardingDestination(name: string) {
  return name.trim() === "" ? "/onboarding" : "/app";
}
