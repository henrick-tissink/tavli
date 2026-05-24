/**
 * §15 §5.2 — pricing primitives loader (tier amounts + the day's RON reference
 * rate with BNR→admin_manual fallback + staleness labelling).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { TIER_PRICES, EXTRA_LOCATION, type TierPrice } from "@/lib/pricing/tier-prices";

export type RateStaleness = "fresh" | "stale_1d" | "stale_warn" | "stale_critical";

export interface RonRate {
  rate: number;
  effectiveDate: string;
  source: string;
  staleness: RateStaleness;
}

export interface PricingPrimitives {
  tiers: TierPrice[];
  extraLocation: typeof EXTRA_LOCATION;
  ronRate: RonRate | null;
}

/** Days between `effectiveDate` and `today` → staleness tier (§5.1). */
export function rateStaleness(effectiveDate: string, today: string): RateStaleness {
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${effectiveDate}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return "fresh";
  if (days <= 1) return "stale_1d";
  if (days <= 14) return "stale_warn";
  return "stale_critical";
}

interface Deps {
  db: typeof dbAdmin;
  now?: () => Date;
}

export function makeLoadPricingPrimitives(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  return async function loadPricingPrimitives(): Promise<PricingPrimitives> {
    // Prefer the most recent BNR row; fall back to a non-expired admin override.
    const rows = (await deps.db.execute(sql`
      SELECT source, effective_date::text AS effective_date, rate::float8 AS rate
      FROM currency_reference_rates
      WHERE (source = 'bnr_eur_ron')
         OR (source = 'admin_manual' AND (override_expires_at IS NULL OR override_expires_at > now()))
      ORDER BY (source = 'bnr_eur_ron') DESC, effective_date DESC
      LIMIT 1
    `)) as unknown as Array<{ source: string; effective_date: string; rate: number }>;

    const r = rows[0];
    const ronRate: RonRate | null = r
      ? { rate: r.rate, effectiveDate: r.effective_date, source: r.source, staleness: rateStaleness(r.effective_date, now().toISOString().slice(0, 10)) }
      : null;

    return { tiers: TIER_PRICES, extraLocation: EXTRA_LOCATION, ronRate };
  };
}

export const loadPricingPrimitives = makeLoadPricingPrimitives({ db: dbAdmin });
