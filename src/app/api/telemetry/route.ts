import { NextRequest, NextResponse } from "next/server";
import { recordView, setSaved } from "@/lib/telemetry/record";
import { isLocale } from "@/lib/i18n/locale";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

/**
 * Fire-and-forget telemetry beacon from the public venue pages.
 *
 * - {type:"view", restaurantId, locale?} — one venue-page view (no user id)
 * - {type:"save", restaurantId, clientId, saved} — sync a save/unsave of the
 *   device's local saved list (clientId is a device-generated random uuid)
 *
 * Non-uuid restaurant ids (mock-mode fixtures) are rejected with 400; the
 * client treats failures as non-fatal.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  if (typeof b.restaurantId !== "string" || !isUuid(b.restaurantId)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (b.type === "view") {
    const locale =
      typeof b.locale === "string" && isLocale(b.locale) ? b.locale : null;
    if (typeof b.locale === "string" && locale === null) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    await recordView(b.restaurantId, locale);
    return new NextResponse(null, { status: 204 });
  }

  if (b.type === "save") {
    if (
      typeof b.clientId !== "string" ||
      !isUuid(b.clientId) ||
      typeof b.saved !== "boolean"
    ) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    await setSaved(b.restaurantId, b.clientId, b.saved);
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
}
