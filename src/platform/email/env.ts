import { z } from "zod";

export type EmailEnvironment = Readonly<{ apiKey: string; from: string }>;
export function requireEmailEnvironment(environment: Readonly<Record<string, string | undefined>>): EmailEnvironment {
  const apiKey = environment.RESEND_API_KEY?.trim();
  if (!apiKey?.startsWith("re_") || apiKey.startsWith("re_replace")) {
    throw new Error("RESEND_API_KEY requires a non-placeholder server secret.");
  }
  const from = z.email().safeParse(environment.AUTH_EMAIL_FROM?.trim());
  if (!from.success) throw new Error("AUTH_EMAIL_FROM requires a verified-domain email address.");
  return { apiKey, from: from.data };
}
