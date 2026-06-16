import "server-only";
import { listActiveStandingSeries } from "@/lib/repos/standing-repo";
import { materializeStanding } from "@/lib/standing/materialize";

/** Nightly: roll every active standing series' horizon forward. Per-series
 *  failures are logged and do not abort the sweep. */
export async function materializeAllStanding(): Promise<void> {
  const series = await listActiveStandingSeries();
  for (const s of series) {
    try {
      await materializeStanding(s.id);
    } catch (e) {
      console.error(`[standing] materialize failed for series ${s.id}`, e);
    }
  }
}
