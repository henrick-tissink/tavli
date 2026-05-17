/**
 * Mailpit helpers for E2E tests against the local Supabase stack.
 *
 * Supabase local ships Mailpit on http://127.0.0.1:54324 by default; all
 * outbound mail (auth OTP, transactional via Resend SMTP forwarding, etc.)
 * lands here. The relevant REST endpoints are:
 *
 *   GET    /api/v1/messages?limit=N
 *   GET    /api/v1/message/{id}
 *   DELETE /api/v1/messages
 */

const MAILPIT_BASE = process.env.E2E_MAILPIT_BASE ?? "http://127.0.0.1:54324";

interface MailpitListItem {
  ID: string;
  To: { Address: string; Name: string }[];
  Subject: string;
  Created: string;
}

interface MailpitMessage {
  ID: string;
  From: { Address: string; Name: string };
  To: { Address: string; Name: string }[];
  Subject: string;
  Text: string;
  HTML: string;
  Created: string;
}

export async function clearMailpit(): Promise<void> {
  await fetch(`${MAILPIT_BASE}/api/v1/messages`, { method: "DELETE" });
}

export async function listMessagesFor(
  email: string,
): Promise<MailpitListItem[]> {
  const res = await fetch(`${MAILPIT_BASE}/api/v1/messages?limit=50`);
  if (!res.ok) throw new Error(`Mailpit list failed: ${res.status}`);
  const data = (await res.json()) as { messages: MailpitListItem[] };
  return (data.messages ?? []).filter((m) =>
    m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()),
  );
}

export async function getMessage(id: string): Promise<MailpitMessage> {
  const res = await fetch(`${MAILPIT_BASE}/api/v1/message/${id}`);
  if (!res.ok) throw new Error(`Mailpit get failed: ${res.status}`);
  return (await res.json()) as MailpitMessage;
}

/**
 * Poll Mailpit until at least one message arrives for `email`, then return
 * the most recent one. Times out after ~15s.
 */
export async function waitForLatestEmail(
  email: string,
  { timeoutMs = 15_000, pollMs = 500 }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const items = await listMessagesFor(email);
    if (items.length > 0) {
      const newest = items.sort((a, b) =>
        b.Created.localeCompare(a.Created),
      )[0];
      return getMessage(newest.ID);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Timed out waiting for mail to ${email}`);
}

/**
 * Extracts the magic-link URL from a Supabase Auth OTP email. The link
 * lands on /auth/callback with `?code=&token=`.
 */
export function extractAuthCallbackUrl(body: string): string {
  // Supabase OTP emails embed the verification link; match the first URL
  // that points to /auth/callback or /auth/v1/verify.
  const match = body.match(/https?:\/\/[^\s"<>]+\/(?:auth\/callback|auth\/v1\/verify)[^\s"<>]*/i);
  if (!match) throw new Error("no auth-callback URL in email body");
  return match[0];
}
