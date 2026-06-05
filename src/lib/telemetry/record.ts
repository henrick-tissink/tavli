/**
 * Telemetry writers for the partner overview stat cards (0062).
 *
 * View events carry no user/device identifier — countable, not trackable.
 * Saves mirror the diner device's local saved list keyed by a client-generated
 * random id (insert on save, delete on unsave).
 *
 * Like the translations loaders, these always target the real DB via the
 * service client, so they no-op in mock mode (mock fixture ids aren't uuids).
 */

import "server-only";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { restaurantViewEvents, restaurantSaves } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/locale";

interface Deps {
  db: typeof dbAdmin;
  /** Mirrors the repo layer's mock/db switch; defaults to true for tests. */
  enabled?: () => boolean;
}

const dbEnabled = () => process.env.NEXT_PUBLIC_USE_DB === "true";

export function makeRecordView(deps: Deps) {
  return async function recordView(
    restaurantId: string,
    locale: Locale | null,
  ): Promise<void> {
    if (!(deps.enabled?.() ?? true)) return;
    await deps.db.insert(restaurantViewEvents).values({ restaurantId, locale });
  };
}

export function makeSetSaved(deps: Deps) {
  return async function setSaved(
    restaurantId: string,
    clientId: string,
    saved: boolean,
  ): Promise<void> {
    if (!(deps.enabled?.() ?? true)) return;
    if (saved) {
      await deps.db
        .insert(restaurantSaves)
        .values({ restaurantId, clientId })
        .onConflictDoNothing();
    } else {
      await deps.db
        .delete(restaurantSaves)
        .where(
          and(
            eq(restaurantSaves.restaurantId, restaurantId),
            eq(restaurantSaves.clientId, clientId),
          ),
        );
    }
  };
}

export const recordView = makeRecordView({ db: dbAdmin, enabled: dbEnabled });
export const setSaved = makeSetSaved({ db: dbAdmin, enabled: dbEnabled });
