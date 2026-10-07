export type EmailMessage = Readonly<{ to: string; subject: string; html: string; text: string }>;
export interface EmailSender { send(message: EmailMessage): Promise<void> }
