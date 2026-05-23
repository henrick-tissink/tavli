import { NextRequest, NextResponse } from "next/server";
import { recordCookieConsent } from "@/lib/cookie-consent/actions";

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

  const { visitorSessionId, analytics, marketingTracking, dinerId, organizationId } =
    body as {
      visitorSessionId: string;
      analytics: boolean;
      marketingTracking: boolean;
      dinerId?: string;
      organizationId?: string;
    };

  await recordCookieConsent({
    visitorSessionId,
    analytics,
    marketingTracking,
    dinerId,
    organizationId,
  });

  return NextResponse.json({ ok: true });
}
