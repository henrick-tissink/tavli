"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { allowedTransitions, type TableStatus } from "@/lib/tables/state-machine";
import { useT } from "@/lib/i18n/messages-provider";
import {
  updateTableStatusAction,
  combineTablesAction,
  dissolveCombinationAction,
  addWalkinAction,
  callWalkinAction,
  seatWalkinAction,
  markWalkinLeftAction,
  assignReservationToTableAction,
} from "../live-actions";

interface TableVM {
  id: string;
  label: string;
  sectionId: string | null;
  currentStatus: TableStatus;
  currentCombinationId: string | null;
  capacityMin: number;
  capacityMax: number;
}
interface ReservationVM {
  id: string;
  guestName: string;
  partySize: number;
  time: string; // HH:MM
}
interface WalkinVM {
  id: string;
  guestName: string;
  partySize: number;
  status: string;
  position: number;
  estimatedWaitMinutes: number | null;
}

const STATUS_STYLE: Record<TableStatus, string> = {
  free: "bg-emerald-50 border-emerald-300 text-emerald-800",
  booked: "bg-blue-50 border-blue-300 text-blue-800",
  seated: "bg-amber-50 border-amber-300 text-amber-900",
  paying: "bg-violet-50 border-violet-300 text-violet-800",
  dirty: "bg-stone-100 border-stone-300 text-stone-700",
  combined: "bg-indigo-50 border-indigo-300 text-indigo-800",
  blocked: "bg-red-50 border-red-300 text-red-800",
};

export function LiveFloor({
  restaurantId,
  sections,
  tables,
  walkins,
  reservations,
}: {
  restaurantId: string;
  sections: { id: string; name: string }[];
  tables: TableVM[];
  walkins: WalkinVM[];
  reservations: ReservationVM[];
}) {
  const t = useT("partner.tables");
  const statusLabel = (status: TableStatus) => t(`status.${status}`);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [combineMode, setCombineMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error === "invalid_transition" ? t("liveFloor.errorInvalidTransition") : t("liveFloor.errorFailed"));
      else router.refresh();
    });
  }

  function changeStatus(table: TableVM, to: TableStatus) {
    // Express clear (seated → free) — capture an optional reason per §08 §5.
    let notes: string | undefined;
    if (table.currentStatus === "seated" && to === "free") {
      notes = window.prompt(t("liveFloor.clearReasonPrompt")) ?? undefined;
    }
    run(() => updateTableStatusAction({ tableId: table.id, toStatus: to, notes }));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function doCombine() {
    const ids = [...selected];
    if (ids.length < 2) return;
    run(() => combineTablesAction({ restaurantId, tableIds: ids }));
    setSelected(new Set());
    setCombineMode(false);
  }

  const grouped = [
    ...sections.map((s) => ({ id: s.id, name: s.name, items: tables.filter((tbl) => tbl.sectionId === s.id) })),
    { id: "none", name: t("liveFloor.noSection"), items: tables.filter((tbl) => !tbl.sectionId) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setCombineMode((v) => !v);
              setSelected(new Set());
            }}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              combineMode ? "border-brand-primary bg-brand-primary-soft text-brand-primary-dark" : "border-border text-text-secondary"
            }`}
          >
            {combineMode ? t("liveFloor.combineCancel") : t("liveFloor.combineStart")}
          </button>
          {combineMode && (
            <button
              type="button"
              disabled={selected.size < 2 || pending}
              onClick={doCombine}
              className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t("liveFloor.combineSelection", { count: selected.size })}
            </button>
          )}
          {error && <span className="text-sm text-red-700" role="alert">{error}</span>}
        </div>

        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.id}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{g.name}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {g.items.map((tbl) => {
                  const selectable = combineMode && tbl.currentStatus === "free";
                  const isSel = selected.has(tbl.id);
                  return (
                    <div
                      key={tbl.id}
                      className={`rounded-card border p-3 ${STATUS_STYLE[tbl.currentStatus]} ${isSel ? "ring-2 ring-brand-primary" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-lg font-bold">{tbl.label}</span>
                        <span className="text-xs">{tbl.capacityMin}–{tbl.capacityMax}</span>
                      </div>
                      <div className="mt-0.5 text-xs font-medium">{statusLabel(tbl.currentStatus)}</div>

                      {selectable ? (
                        <button
                          type="button"
                          onClick={() => toggleSelect(tbl.id)}
                          className="mt-2 w-full rounded-md border border-current/30 bg-white/60 px-2 py-1 text-xs font-semibold"
                        >
                          {isSel ? t("liveFloor.selected") : t("liveFloor.select")}
                        </button>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {tbl.currentStatus === "combined" && tbl.currentCombinationId ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                run(() =>
                                  dissolveCombinationAction({ restaurantId, combinationId: tbl.currentCombinationId! }),
                                )
                              }
                              className="rounded-md bg-white/70 px-2 py-1 text-xs font-semibold hover:bg-white"
                            >
                              {t("liveFloor.dissolve")}
                            </button>
                          ) : (
                            allowedTransitions(tbl.currentStatus).map((to) => (
                              <button
                                key={to}
                                type="button"
                                disabled={pending}
                                onClick={() => changeStatus(tbl, to)}
                                className="rounded-md bg-white/70 px-2 py-1 text-xs font-medium hover:bg-white"
                              >
                                {t("liveFloor.transitionTo", { status: statusLabel(to) })}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <ReservationsPanel
          reservations={reservations}
          freeTables={tables.filter((tbl) => tbl.currentStatus === "free")}
          pending={pending}
          run={run}
        />
        <WalkinPanel restaurantId={restaurantId} walkins={walkins} pending={pending} run={run} />
      </div>
    </div>
  );
}

/** §08 §6.2 — assign today's unseated bookings to a free table. */
function ReservationsPanel({
  reservations,
  freeTables,
  pending,
  run,
}: {
  reservations: ReservationVM[];
  freeTables: TableVM[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const t = useT("partner.tables");
  const [pick, setPick] = useState<Record<string, string>>({});
  return (
    <section className="rounded-card border border-border bg-surface-white p-4">
      <h2 className="font-display text-lg font-bold text-text-primary mb-3">{t("reservationsPanel.title")}</h2>
      {reservations.length === 0 ? (
        <p className="text-sm text-text-muted">{t("reservationsPanel.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {reservations.map((r) => (
            <li key={r.id} className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-text-primary">
                {r.time} · {r.guestName}
              </p>
              <p className="text-xs text-text-muted mb-2">
                {t("reservationsPanel.party", { count: r.partySize })}
              </p>
              <div className="flex items-center gap-2">
                <select
                  aria-label={t("reservationsPanel.pickTableAriaLabel", { name: r.guestName })}
                  value={pick[r.id] ?? ""}
                  onChange={(e) => setPick((p) => ({ ...p, [r.id]: e.target.value }))}
                  className="flex-1 rounded border border-border p-1.5 text-sm"
                >
                  <option value="">{t("reservationsPanel.pickTablePlaceholder")}</option>
                  {freeTables.map((tbl) => (
                    <option key={tbl.id} value={tbl.id}>
                      {t("reservationsPanel.tableOption", { label: tbl.label, min: tbl.capacityMin, max: tbl.capacityMax })}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || !pick[r.id]}
                  onClick={() => run(() => assignReservationToTableAction({ reservationId: r.id, tableId: pick[r.id] }))}
                  className="rounded bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {t("reservationsPanel.seat")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WalkinPanel({
  restaurantId,
  walkins,
  pending,
  run,
}: {
  restaurantId: string;
  walkins: WalkinVM[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const t = useT("partner.tables");
  const [name, setName] = useState("");
  const [party, setParty] = useState(2);
  const [phone, setPhone] = useState("");

  function add() {
    if (!name.trim()) return;
    run(() => addWalkinAction({ restaurantId, guestName: name, partySize: party, guestPhone: phone || undefined }));
    setName("");
    setParty(2);
    setPhone("");
  }

  return (
    <aside className="rounded-card border border-border bg-surface-white p-4">
      <h2 className="font-display text-lg text-text-primary">{t("walkinPanel.title")}</h2>

      <div className="mt-3 space-y-2 rounded-lg bg-surface-bg p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("walkinPanel.namePlaceholder")}
          className="w-full rounded-md border border-border px-2 py-1.5 text-sm focus:border-brand-primary focus:outline-none"
        />
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            max={30}
            value={party}
            onChange={(e) => setParty(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 rounded-md border border-border px-2 py-1.5 text-sm focus:border-brand-primary focus:outline-none"
            aria-label={t("walkinPanel.partyAriaLabel")}
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("walkinPanel.phonePlaceholder")}
            className="flex-1 rounded-md border border-border px-2 py-1.5 text-sm focus:border-brand-primary focus:outline-none"
          />
        </div>
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={add}
          className="w-full rounded-md bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {t("walkinPanel.add")}
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {walkins.length === 0 && <li className="text-sm text-text-muted">{t("walkinPanel.empty")}</li>}
        {walkins.map((w) => (
          <li key={w.id} className="rounded-lg border border-border p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">
                {w.position}. {w.guestName}
              </span>
              <span className="text-xs text-text-muted">{t("walkinPanel.party", { count: w.partySize })}</span>
            </div>
            <div className="text-xs text-text-muted">
              {w.status === "called" ? t("walkinPanel.statusCalled") : t("walkinPanel.statusWaiting")}
              {w.estimatedWaitMinutes != null ? t("walkinPanel.waitSuffix", { minutes: w.estimatedWaitMinutes }) : ""}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {w.status === "waiting" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => callWalkinAction(w.id))}
                  className="rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-surface-bg"
                >
                  {t("walkinPanel.call")}
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => seatWalkinAction({ walkinId: w.id }))}
                className="rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-surface-bg"
              >
                {t("walkinPanel.seat")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => markWalkinLeftAction(w.id))}
                className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-surface-bg"
              >
                {t("walkinPanel.left")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
