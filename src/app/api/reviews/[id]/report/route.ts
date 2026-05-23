/**
 * POST /api/reviews/[id]/report — §06 §5.3 Wave 4 sub-unit K.2.
 *
 * Anonymous-allowed (no auth required). Rate-limited per IP via the
 * review_report scope (5 req / 3600 s — see src/lib/rate-limit/scopes.ts).
 *
 * Body: { reason: ReportReason; details?: string }
 * Returns: { ok: true; reportId: string } | { error: string }
 *
 * The public form UI at /r/[review_id]/report is deferred to post-v1.
 */

import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit/enforce";
import { reviewModerationActions } from "@/lib/reviews/moderation";
import type { ReportReason } from "@/lib/reviews/moderation";

const VALID_REASONS = new Set<ReportReason>([
  "inappropriate",
  "fake",
  "spam",
  "off_topic",
  "personal_attack",
  "gdpr_takedown",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const limit = await enforceRateLimit({
    key: `review_report:${ip}`,
    scope: "review_report",
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limit_exceeded" }, { status: 429 });
  }

  let body: { reason?: unknown; details?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.reason !== "string" || !VALID_REASONS.has(body.reason as ReportReason)) {
    return NextResponse.json(
      {
        error: "invalid_reason",
        valid: [...VALID_REASONS],
      },
      { status: 422 },
    );
  }

  const result = await reviewModerationActions.submitReport({
    reviewId: id,
    reason: body.reason as ReportReason,
    details: typeof body.details === "string" ? body.details : undefined,
    reporterIp: ip,
  });

  return NextResponse.json({ ok: true, reportId: result.id });
}
