/**
 * §15 §5.1 — `pricing.refresh-currency-rates` (daily 14:30 EEST). Fetch the BNR
 * EUR/RON rate, upsert, revalidate the pricing pages. + setManualRate admin
 * override. External fetch + revalidate are injected (no live network in tests).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { parseBnrXml } from "@/lib/pricing/parse-bnr";

const BNR_URL = "https://www.bnr.ro/nbrfxrates.xml";
const PATHS = ["/pricing", "/en/pricing", "/de/pricing"];

interface RefreshDeps {
  db: typeof dbAdmin;
  fetchXml: () => Promise<string>;
  revalidate: (path: string) => void | Promise<void>;
}

export function makeRefreshBnrRate(deps: RefreshDeps) {
  return async function refreshBnrRate(): Promise<void> {
    const xml = await deps.fetchXml();
    const { rate, effectiveDate } = parseBnrXml(xml);
    await deps.db.execute(sql`
      INSERT INTO currency_reference_rates (source, effective_date, rate)
      VALUES ('bnr_eur_ron', ${effectiveDate}::date, ${rate})
      ON CONFLICT (source, effective_date) DO UPDATE SET rate = excluded.rate, fetched_at = now()
    `);
    for (const p of PATHS) await deps.revalidate(p);
  };
}

export const refreshCurrencyRates = makeRefreshBnrRate({
  db: dbAdmin,
  fetchXml: async () => {
    const res = await fetch(BNR_URL);
    if (!res.ok) throw new Error(`BNR fetch failed: ${res.status}`);
    return await res.text();
  },
  revalidate: async (path) => {
    const { revalidatePath } = await import("next/cache");
    revalidatePath(path);
  },
});

interface ManualDeps {
  db: typeof dbAdmin;
  recordAudit: typeof realRecordAudit;
}

export function makeSetManualRate(deps: ManualDeps) {
  return async function setManualRate(input: {
    effectiveDate: string;
    rate: number;
    overrideExpiresAt: string;
    actorUserId: string;
  }): Promise<void> {
    await deps.db.execute(sql`
      INSERT INTO currency_reference_rates (source, effective_date, rate, fetched_by_user_id, override_expires_at)
      VALUES ('admin_manual', ${input.effectiveDate}::date, ${input.rate}, ${input.actorUserId}, ${input.overrideExpiresAt}::timestamptz)
      ON CONFLICT (source, effective_date) DO UPDATE SET rate = excluded.rate, override_expires_at = excluded.override_expires_at, fetched_at = now()
    `);
    await deps.recordAudit({
      action: AUDIT.pricing.rate_override_set,
      subjectType: "currency_reference_rate",
      actorUserId: input.actorUserId,
      actorRole: "tavli_admin",
      context: { effective_date: input.effectiveDate, rate: input.rate, override_expires_at: input.overrideExpiresAt },
    });
  };
}
