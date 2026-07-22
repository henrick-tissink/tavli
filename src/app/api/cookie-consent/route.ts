import { NextRequest, NextResponse } from "next/server";
import { recordCookieConsent } from "@/lib/cookie-consent/actions";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).visitorSessionId !== "string" ||
    typeof (body as Record<string, unknown>).analytics !== "boolean" ||
    typeof (body as Record<string, unknown>).marketingTracking !== "boolean"
  ) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { visitorSessionId, analytics, marketingTracking } = body as {
    visitorSessionId: string;
    analytics: boolean;
    marketingTracking: boolean;
  };

  // SECURITY: never attribute consent to a caller-supplied diner/org — the body
  // is untrusted, so accepting `dinerId`/`organizationId` from it would let an
  // attacker forge a consent record against any diner. Attribution is derived
  // from the authenticated session only. Diners are per-organization CRM rows
  // with no auth-user link, so a logged-in visitor still can't be resolved to a
  // `dinerId` here; we attribute the session's organization (server-authored)
  // and leave the consent diner-anonymous. Logged-out visitors keep the fully
  // anonymous path (visitorSessionId only).
  const session = await getCurrentSession();
  const organizationId = session?.profile.defaultOrganizationId ?? undefined;

  await recordCookieConsent({
    visitorSessionId,
    analytics,
    marketingTracking,
    organizationId,
  });

  return NextResponse.json({ ok: true });
}
