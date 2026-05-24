/**
 * GET /c/[sendId]/[token]?dst=<base64url> — §11 §5.2 marketing link click
 * tracking. Records the click (when the token is valid) then 302-redirects to
 * the original destination. Always redirects if `dst` is a valid http(s) URL —
 * a real email link must never 404 — recording is best-effort.
 */
import { NextRequest, NextResponse } from "next/server";
import { recordClick } from "@/lib/marketing/links";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sendId: string; token: string }> },
) {
  const { sendId, token } = await params;
  const dstRaw = req.nextUrl.searchParams.get("dst") ?? "";

  let dst = "";
  try {
    dst = Buffer.from(dstRaw, "base64url").toString("utf8");
  } catch {
    dst = "";
  }
  if (!/^https?:\/\//i.test(dst)) {
    return NextResponse.json({ error: "invalid_destination" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
  // Best-effort — never block the redirect on tracking failure.
  try {
    await recordClick({ sendId, token, dst, ip, userAgent: req.headers.get("user-agent") });
  } catch {
    /* swallow — the diner still gets their link */
  }
  return NextResponse.redirect(dst, 302);
}
