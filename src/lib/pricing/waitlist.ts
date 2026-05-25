/**
 * §15 §18 OQ8 / §16 — pricing-page wait-list join. Pure-ish core with injected
 * db + rate-limiter + audit so it unit-tests without a live DB. Throws a coded
 * `WaitlistError`; the server action translates it to an ActionResult (the
 * lib-throws / app-wraps convention).
 */
import "server-only";
import { z } from "zod";
import { dbAdmin } from "@/lib/db/admin";
import { prospectWaitlist } from "@/lib/db/schema";
import { AUDIT } from "@/lib/audit/actions";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { enforceRateLimit as realEnforceRateLimit } from "@/lib/rate-limit/enforce";

const emailSchema = z.string().trim().email().max(255);
const SUPPORTED_LOCALES = ["ro", "en", "de"];

export interface JoinWaitlistInput {
  email: string;
  organizationNameHint?: string | null;
  locale: string;
  ip?: string | null;
}

export interface JoinWaitlistResult {
  id: string;
}

interface Deps {
  db: Pick<typeof dbAdmin, "insert">;
  enforceRateLimit: typeof realEnforceRateLimit;
  recordAudit: typeof realRecordAudit;
}

/** `message` carries the ActionErrorCode the action maps to. */
export class WaitlistError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export function makeJoinWaitlist(deps: Deps) {
  return async function joinWaitlist(
    input: JoinWaitlistInput,
  ): Promise<JoinWaitlistResult> {
    const parsed = emailSchema.safeParse(input.email);
    if (!parsed.success) throw new WaitlistError("invalid_input");
    const email = parsed.data.toLowerCase();
    const locale = SUPPORTED_LOCALES.includes(input.locale) ? input.locale : "ro";

    const perEmail = await deps.enforceRateLimit({
      key: `waitlist:${email}`,
      scope: "pricing_waitlist_join_per_email",
    });
    if (!perEmail.allowed) throw new WaitlistError("rate_limited");

    // B3: apply the per-IP cap even when the IP is missing (no x-forwarded-for).
    // IP-less requests share a single coarse bucket so the cap can't be bypassed
    // simply by stripping the header.
    const perIp = await deps.enforceRateLimit({
      key: `waitlist-ip:${input.ip || "unknown"}`,
      scope: "pricing_waitlist_join_per_ip",
    });
    if (!perIp.allowed) throw new WaitlistError("rate_limited");

    let id: string;
    try {
      const rows = await deps.db
        .insert(prospectWaitlist)
        .values({
          email,
          organizationNameHint: input.organizationNameHint?.trim() || null,
          source: "pricing_page",
          sourceLocale: locale,
          sourceIp: input.ip ?? null,
        })
        .returning({ id: prospectWaitlist.id });
      id = rows[0].id;
    } catch (err) {
      // Partial unique index on lower(email) where invited/redacted are null.
      if (isUniqueViolation(err)) throw new WaitlistError("TV1301");
      throw err;
    }

    await deps.recordAudit({
      action: AUDIT.pricing.waitlist_email_added,
      subjectType: "prospect_waitlist",
      subjectId: id,
      actorUserId: null,
      // Anonymous public submitter — the same role the public reservation /
      // event-request flows use for an unauthenticated web visitor.
      actorRole: "diner",
      context: {
        source_locale: locale,
        organization_name_hint: input.organizationNameHint?.trim() || null,
      },
    });

    return { id };
  };
}

export const joinWaitlist = makeJoinWaitlist({
  db: dbAdmin,
  enforceRateLimit: realEnforceRateLimit,
  recordAudit: realRecordAudit,
});
