import type { EmailMessage, EmailSender } from "../../src/platform/email/sender";

// Test-only external email boundary. No runtime flags or fixture endpoints.
export class CaptureEmailSender implements EmailSender {
  readonly messages: EmailMessage[] = [];
  async send(message: EmailMessage) { this.messages.push({ ...message }); }
}
