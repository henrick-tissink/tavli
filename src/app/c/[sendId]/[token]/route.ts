/**
 * GET /c/[sendId]/[token]?dst=<base64url> — §11 §5.2 marketing link click
 * tracking. Behaviour:
 *   - valid HMAC token → record the click (best-effort) and 302-redirect to dst;
 *   - missing/forged token (recordClick returns an error) → 404 (not an open
 *     redirect — a genuine email link always carries a valid token);
 *   - dst not a valid http(s) URL → 400.
 * Click LOGGING failures don't block a valid link (handled inside recordClick),
 * so a thrown error here means the token couldn't be verified → 404.
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
  let result: Awaited<ReturnType<typeof recordClick>>;
  try {
    result = await recordClick({ sendId, token, dst, ip, userAgent: req.headers.get("user-agent") });
  } catch {
    // recordClick only throws if it couldn't load the send row to verify the
    // token (DB error). We must NOT redirect to an unverified dst — that would
    // be an open redirect. Click logging itself is best-effort inside recordClick.
    return NextResponse.json({ error: "invalid_link" }, { status: 404 });
  }
  // Gate the redirect on token validity: an unsigned/forged /c link is not an
  // open redirect. A genuine email link always carries a valid HMAC token.
  if ("error" in result) {
    return NextResponse.json({ error: "invalid_link" }, { status: 404 });
  }
  return NextResponse.redirect(result.redirectTo, 302);
}
