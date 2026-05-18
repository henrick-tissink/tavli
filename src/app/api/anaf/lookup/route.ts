import { NextRequest, NextResponse } from "next/server";
import { lookupCui } from "@/lib/integrations/anaf";

/**
 * Public, read-only CUI lookup used by the EventRequestSheetV2 identity step.
 * Wraps the ANAF webservice via `lookupCui`. Returns a JSON envelope shaped
 * for the consumer-side CuiLookupField:
 *   { ok: true, denumire?: string, adresa?: string }
 * On invalid or missing CUI we return `{ ok: false, error }` with a 400.
 */
export async function GET(req: NextRequest) {
  const cui = req.nextUrl.searchParams.get("cui");
  if (!cui) {
    return NextResponse.json({ ok: false, error: "missing cui" }, { status: 400 });
  }
  const result = await lookupCui(cui);
  if (!result.ok || !result.found) {
    return NextResponse.json({ ok: false, found: false, cui: result.cui });
  }
  return NextResponse.json({
    ok: true,
    found: true,
    cui: result.cui,
    denumire: result.name,
    adresa: result.address,
  });
}
