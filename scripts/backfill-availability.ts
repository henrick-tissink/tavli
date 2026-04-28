/**
 * One-shot backfill: populate `restaurant_availability` for every live
 * restaurant whose hours were captured during onboarding but never
 * projected into the structured availability table.
 *
 * Why this exists: prior to the saveHours fix, partner-side hours were
 * written only to `restaurants.schedule` (display JSONB). The consumer
 * reservation flow reads slot times from `restaurant_availability` —
 * which was always empty. After the fix, NEW hours saves populate
 * availability automatically. Existing live restaurants need this
 * one-shot to become bookable without partners manually re-saving.
 *
 * Source of structured hours, in order of preference:
 *   1. `draft_restaurants.payload.hours` (the original DayHours[] from
 *      the onboarding form)
 *   2. DEFAULT_HOURS (Mon–Fri 12:00–23:00, Sat 11:00–23:30, Sun 11:00–23:00)
 *      — used only when a restaurant has no draft (rare; pre-onboarding-tracking).
 *
 * Usage:
 *   # against prod
 *   npx tsx --env-file=.env.prod scripts/backfill-availability.ts
 *   # against local
 *   npx tsx --env-file=.env.local scripts/backfill-availability.ts
 *
 * Idempotent: re-runs delete + reinsert.
 */

import { createClient } from "@supabase/supabase-js";
import { hoursToAvailabilityRows } from "../src/lib/availability";

// DayHours + DEFAULT_HOURS are inlined here so this script doesn't pull
// `@/lib/onboarding` (which is `import "server-only"` and can't run
// outside the Next bundler).
interface DayHours {
  dayOfWeek: number;
  isOpen: boolean;
  openAt: string;
  closeAt: string;
}

const DEFAULT_HOURS: DayHours[] = [
  { dayOfWeek: 1, isOpen: true, openAt: "12:00", closeAt: "23:00" },
  { dayOfWeek: 2, isOpen: true, openAt: "12:00", closeAt: "23:00" },
  { dayOfWeek: 3, isOpen: true, openAt: "12:00", closeAt: "23:00" },
  { dayOfWeek: 4, isOpen: true, openAt: "12:00", closeAt: "23:00" },
  { dayOfWeek: 5, isOpen: true, openAt: "12:00", closeAt: "23:30" },
  { dayOfWeek: 6, isOpen: true, openAt: "11:00", closeAt: "23:30" },
  { dayOfWeek: 0, isOpen: true, openAt: "11:00", closeAt: "23:00" },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with --env-file pointing at .env.prod or .env.local.",
    );
    process.exit(1);
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: live, error: listError } = await sb
    .from("restaurants")
    .select("id, slug, owner_user_id")
    .eq("status", "live");
  if (listError) {
    console.error("Failed to list live restaurants:", listError.message);
    process.exit(1);
  }
  console.log(`Found ${live?.length ?? 0} live restaurant(s).`);

  let touched = 0;
  let skipped = 0;

  for (const r of live ?? []) {
    let hours: DayHours[] = DEFAULT_HOURS;
    let source = "DEFAULT_HOURS";

    if (r.owner_user_id) {
      const { data: draft } = await sb
        .from("draft_restaurants")
        .select("payload")
        .eq("owner_user_id", r.owner_user_id)
        .maybeSingle();
      const draftHours = (draft?.payload as { hours?: DayHours[] } | null)?.hours;
      if (draftHours && draftHours.length === 7) {
        hours = draftHours;
        source = "draft.payload.hours";
      }
    }

    const rows = hoursToAvailabilityRows(r.id, hours);

    const { error: delError } = await sb
      .from("restaurant_availability")
      .delete()
      .eq("restaurant_id", r.id);
    if (delError) {
      console.error(`  ${r.slug}: delete failed: ${delError.message}`);
      skipped++;
      continue;
    }

    if (rows.length > 0) {
      const { error: insError } = await sb
        .from("restaurant_availability")
        .insert(rows);
      if (insError) {
        console.error(`  ${r.slug}: insert failed: ${insError.message}`);
        skipped++;
        continue;
      }
    }

    console.log(
      `  ${r.slug}: backfilled ${rows.length} day(s) from ${source}`,
    );
    touched++;
  }

  console.log(`Done. Touched ${touched}, skipped ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
