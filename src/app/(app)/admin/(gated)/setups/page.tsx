/**
 * §14 §8.4 — Tavli-admin in-flight setups dashboard. Lists trialing orgs with
 * per-restaurant setup-step completion + the at-risk / awaiting / stuck signals.
 * Read-only founder visibility (gated to role=admin by the (gated) layout).
 */
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { StatCard } from "@/components/admin/StatCard";
import { CalendarClock, AlertTriangle, Hourglass } from "lucide-react";

export const dynamic = "force-dynamic";

interface Row {
  organization_id: string;
  org_name: string;
  restaurant_id: string | null;
  restaurant_name: string | null;
  trial_ends_at: string | null;
  steps_total: number;
  steps_done: number;
  at_risk: boolean;
  awaiting: boolean;
  stuck: boolean;
}

async function loadSetups(): Promise<Row[]> {
  return (await dbAdmin.execute(sql`
    SELECT
      o.id AS organization_id, o.name AS org_name,
      r.id AS restaurant_id, r.name AS restaurant_name,
      s.trial_ends_at::text AS trial_ends_at,
      count(sp.id)::int AS steps_total,
      count(sp.id) FILTER (WHERE sp.status IN ('completed','skipped'))::int AS steps_done,
      bool_or(s.trial_ends_at <= now() + interval '21 days' AND sp.status NOT IN ('completed','skipped')) AS at_risk,
      bool_or(sp.status = 'scheduled' AND sp.scheduled_at < now()) AS awaiting,
      bool_or(sp.status = 'in_progress' AND sp.updated_at < now() - interval '14 days') AS stuck
    FROM subscriptions s
    JOIN organizations o ON o.id = s.organization_id
    LEFT JOIN restaurants r ON r.organization_id = o.id AND r.archived_at IS NULL
    LEFT JOIN setup_progress sp ON sp.restaurant_id = r.id
    WHERE s.status = 'trialing'
    GROUP BY o.id, o.name, r.id, r.name, s.trial_ends_at
    ORDER BY s.trial_ends_at ASC NULLS LAST
  `)) as unknown as Row[];
}

export default async function AdminSetupsPage() {
  const rows = await loadSetups();
  const atRisk = rows.filter((r) => r.at_risk).length;
  const awaiting = rows.filter((r) => r.awaiting).length;
  const stuck = rows.filter((r) => r.stuck).length;

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-primary">Onboarding</p>
        <h1 className="font-display text-3xl font-bold text-text-primary">Configurări în curs</h1>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-4 desktop:grid-cols-3">
        <StatCard label="La risc" value={atRisk} icon={AlertTriangle} tone={atRisk ? "warning" : "muted"} hint="Trial ≤ 21 zile, pași incompleți" />
        <StatCard label="Așteaptă fondatorul" value={awaiting} icon={CalendarClock} tone="muted" hint="Pas programat, termen depășit" />
        <StatCard label="Blocate" value={stuck} icon={Hourglass} tone="muted" hint="În lucru > 14 zile" />
      </section>

      <div className="overflow-x-auto rounded-card border border-border bg-surface-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th scope="col" className="px-4 py-3 font-semibold">Organizație</th>
              <th scope="col" className="px-4 py-3 font-semibold">Restaurant</th>
              <th scope="col" className="px-4 py-3 font-semibold">Progres</th>
              <th scope="col" className="px-4 py-3 font-semibold">Trial expiră</th>
              <th scope="col" className="px-4 py-3 font-semibold">Stare</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-text-muted">Nicio configurare în curs.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.organization_id}-${r.restaurant_id ?? i}`} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-text-primary">{r.org_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.restaurant_name ?? "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.steps_done} / {r.steps_total}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.trial_ends_at?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.at_risk ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">La risc</span>
                      : r.stuck ? <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">Blocat</span>
                      : r.awaiting ? <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">Așteaptă</span>
                      : <span className="text-xs text-text-muted">OK</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
