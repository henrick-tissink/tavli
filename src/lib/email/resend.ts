/**
 * Resend email client with dev fallback.
 *
 * When RESEND_API_KEY is unset (local dev without a real key), emails
 * are logged to the server console and the call resolves successfully.
 * This keeps invitation flows usable before Resend is provisioned.
 */

import "server-only";
import { Resend } from "resend";

let _client: Resend | null = null;

function client(): Resend | null {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _client = new Resend(key);
  return _client;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
  devMode?: boolean; // true when email was console-logged (no RESEND_API_KEY)
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const c = client();
  const from = process.env.EMAIL_FROM ?? "Tavli <hello@tavli.ro>";

  if (!c) {
    console.log(
      `[email dev] would send to=${args.to} subject="${args.subject}" from=${from}`,
    );
    return { ok: true, devMode: true };
  }

  const { error } = await c.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    react: args.react,
    replyTo: args.replyTo,
  });

  if (error) {
    console.error("[email] resend error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
