import "server-only";

import { Resend, type Response as ResendResponse } from "resend";
import { z } from "zod";

import type { EmailEnvironment } from "./env.ts";
import type { EmailSender } from "./sender.ts";

// SDK 6.32 logs raw provider errors outside production. Use its public transport
// extension point, retaining SDK payload/header handling without that PII logger.
class RedactedResend extends Resend {
  override async fetchRequest<T>(path: string, options: RequestInit = {}): Promise<ResendResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, options);
      if (response.ok) return { data: await response.json() as T, error: null, headers: null };
    } catch { /* Network/provider detail is intentionally discarded. */ }
    return { data: null, error: { name: "application_error", statusCode: null, message: "Email delivery unavailable." }, headers: null };
  }
}

export function createResendEmailSender(environment: EmailEnvironment): EmailSender {
  const client = new RedactedResend(environment.apiKey);
  return {
    async send(message) {
      try {
        const result = await client.emails.send({ ...message, from: `셀러방패 <${environment.from}>` },
          { signal: AbortSignal.timeout(10_000) });
        if (result.error || !z.object({ id: z.string().min(1) }).safeParse(result.data).success) {
          throw new Error("Provider rejected delivery.");
        }
      } catch {
        throw new Error("Email delivery unavailable.");
      }
    },
  };
}
