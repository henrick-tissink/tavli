"use client";

/**
 * §08 — Floor-plan editor matching the Tavli design system's "Plan sală":
 * tables render with chairs around them, drag to rearrange (persists
 * position_x/y), a right-hand inspector edits the selected table live
 * (label / section / shape / capacity / online / delete) plus "+ Adaugă masă",
 * and an Aranjament ↔ Diseară toggle flips to a tonight-occupancy view (booked
 * tables fill terracotta with the reservation time, free show "Liber").
 *
 * Wraps the real server actions (createTable / updateTable / archiveTable) so
 * every change is persisted; the canvas + inspector replace the old
 * shapes-only canvas + list-based editing.
 */
import { useRef, useState, useTransition } from "react";
import { Plus, Minus, Trash2, Move } from "lucide-react";
import { toast } from "@/components/toast";
import {
  createTableAction,
  updateTableAction,
  archiveTableAction,
} from "../actions";

export interface EditorTable {
  id: string;
  label: string;
  sectionId: string | null;
  capacityTypical: number;
  shape: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  isBookableOnline: boolean;
}

interface Section {
  id: string;
  name: string;
  color: string | null;
}

interface Booking {
  id: string;
  guestName: string;
  time: string; // "HH:MM:SS"
  partySize: number;
  tableId: string | null;
}

const CANVAS_H = 520;
const isRound = (shape: string) => shape === "round";

export function FloorPlanEditor({
  restaurantId,
  organizationId,
  tables: initialTables,
  sections,
  tonight,
}: {
  restaurantId: string;
  organizationId: string;
  tables: EditorTable[];
  sections: Section[];
  tonight: Booking[];
}) {
  const [tables, setTables] = useState<EditorTable[]>(initialTables);
  const [selId, setSelId] = useState<string | null>(null);
  const [view, setView] = useState<"layout" | "tonight">("layout");
  const [, startTransition] = useTransition();
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offX: number; offY: number } | null>(null);

  const sel = tables.find((t) => t.id === selId) ?? null;
  const sectionColor = (id: string | null) =>
    (id && sections.find((s) => s.id === id)?.color) || "#9A3412";
  const bookingByTable = new Map(tonight.filter((b) => b.tableId).map((b) => [b.tableId!, b]));
  const bookedCount = tables.filter((t) => bookingByTable.has(t.id)).length;

  function persist(id: string, changes: Record<string, unknown>) {
    startTransition(async () => {
      const res = await updateTableAction({ id, restaurantId, organizationId, changes });
      if (!res.ok) toast.error("Modificarea nu a fost salvată.");
    });
  }
  function patch(id: string, changes: Partial<EditorTable>) {
    setTables((ts) => ts.map((t) => (t.id === id ? { ...t, ...changes } : t)));
  }

  // ── drag (layout view only) ────────────────────────────────────────────────
  function onDown(e: React.PointerEvent, t: EditorTable) {
    setSelId(t.id);
    if (view !== "layout") return;
    const rect = canvasRef.current!.getBoundingClientRect();
    drag.current = { id: t.id, offX: e.clientX - rect.left - t.positionX, offY: e.clientY - rect.top - t.positionY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent, t: EditorTable) {
    if (drag.current?.id !== t.id) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width - t.width, Math.round(e.clientX - rect.left - drag.current.offX)));
    const y = Math.max(0, Math.min(CANVAS_H - t.height, Math.round(e.clientY - rect.top - drag.current.offY)));
    patch(t.id, { positionX: x, positionY: y });
  }
  function onUp(t: EditorTable) {
    if (drag.current?.id !== t.id) return;
    drag.current = null;
    persist(t.id, { positionX: t.positionX, positionY: t.positionY });
  }

  // ── chairs around a table ───────────────────────────────────────────────────
  function chairs(t: EditorTable, color: string) {
    const n = Math.max(1, Math.min(14, t.capacityTypical || 2));
    const els: React.ReactNode[] = [];
    const dot = (key: string, style: React.CSSProperties) => (
      <span
        key={key}
        aria-hidden
        className="absolute pointer-events-none"
        style={{ width: 9, height: 9, borderRadius: 3, background: "#fff", border: `1.5px solid ${color}`, ...style }}
      />
    );
    if (isRound(t.shape)) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        els.push(dot(`c${i}`, { left: `${50 + 60 * Math.cos(a)}%`, top: `${50 + 60 * Math.sin(a)}%`, transform: "translate(-50%,-50%)" }));
      }
    } else {
      const top = Math.ceil(n / 2);
      const bot = n - top;
      for (let j = 0; j < top; j++) els.push(dot(`t${j}`, { top: -13, left: `${((j + 1) / (top + 1)) * 100}%`, transform: "translateX(-50%)" }));
      for (let j = 0; j < bot; j++) els.push(dot(`b${j}`, { bottom: -13, left: `${((j + 1) / (bot + 1)) * 100}%`, transform: "translateX(-50%)" }));
    }
    return els;
  }

  // ── add table ───────────────────────────────────────────────────────────────
  function addTable() {
    const label = String(tables.length + 1);
    startTransition(async () => {
      const res = await createTableAction({
        restaurantId,
        organizationId,
        sectionId: sections[0]?.id,
        label,
        capacityMin: 2,
        capacityMax: 4,
        capacityTypical: 2,
        shape: "round",
        positionX: 220,
        positionY: 200,
        width: 80,
        height: 80,
      });
      if (!res.ok) { toast.error("Masa nu a fost adăugată."); return; }
      const id = res.data.id;
      setTables((ts) => [
        ...ts,
        { id, label, sectionId: sections[0]?.id ?? null, capacityTypical: 2, shape: "round", positionX: 220, positionY: 200, width: 80, height: 80, isBookableOnline: true },
      ]);
      setSelId(id);
    });
  }
  function deleteTable(id: string) {
    setTables((ts) => ts.filter((t) => t.id !== id));
    setSelId(null);
    startTransition(async () => {
      const res = await archiveTableAction({ id, restaurantId, organizationId });
      if (!res.ok) toast.error("Masa nu a fost ștearsă.");
    });
  }

  return (
    <div>
      {/* toggle + legend */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="inline-flex rounded-pill border border-border bg-surface-white p-[3px]">
          {([["layout", "Aranjament"], ["tonight", "Diseară"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setView(key); setSelId(null); }}
              className={`rounded-pill px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                view === key ? "bg-brand-primary text-white" : "text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          {sections.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-secondary">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color ?? "#9A3412" }} />
              {s.name}
            </span>
          ))}
          {view === "tonight" && (
            <span className="ml-auto text-[13px] text-text-secondary">
              {bookedCount} rezervate · {tables.length - bookedCount} libere
            </span>
          )}
        </div>
      </div>

      <div className="grid items-start gap-5 desktop:grid-cols-[1fr_300px]">
        {/* canvas */}
        <div
          ref={canvasRef}
          onPointerDown={(e) => { if (e.target === canvasRef.current) setSelId(null); }}
          className="relative w-full overflow-hidden rounded-card border border-border bg-surface-white"
          style={{
            height: CANVAS_H,
            boxShadow: "inset 0 0 0 6px var(--color-surface-bg)",
            backgroundImage: "linear-gradient(rgba(0,0,0,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.025) 1px,transparent 1px)",
            backgroundSize: "28px 28px",
            touchAction: "none",
          }}
        >
          {tables.map((t) => {
            const color = sectionColor(t.sectionId);
            const active = selId === t.id;
            const booking = bookingByTable.get(t.id);
            const booked = view === "tonight" && !!booking;
            return (
              <div
                key={t.id}
                onPointerDown={(e) => onDown(e, t)}
                onPointerMove={(e) => onMove(e, t)}
                onPointerUp={() => onUp(t)}
                className="absolute select-none"
                style={{
                  left: t.positionX,
                  top: t.positionY,
                  width: t.width,
                  height: t.height,
                  cursor: view === "layout" ? "grab" : "pointer",
                  zIndex: active ? 5 : 1,
                }}
              >
                {chairs(t, color)}
                <div
                  className="flex h-full w-full flex-col items-center justify-center overflow-hidden p-0.5 leading-tight"
                  style={{
                    borderRadius: isRound(t.shape) ? "9999px" : "10px",
                    background: booked ? "var(--color-brand-primary)" : "#fff",
                    border: `2px solid ${booked ? "var(--color-brand-primary)" : color}`,
                    outline: active ? "2px solid var(--color-brand-primary)" : "none",
                    outlineOffset: 2,
                    boxShadow: active ? "0 6px 18px rgba(0,0,0,.16)" : "0 1px 3px rgba(0,0,0,.07)",
                    pointerEvents: "none",
                  }}
                >
                  <span className="text-[13px] font-bold" style={{ color: booked ? "#fff" : "var(--color-text-primary)" }}>
                    {t.label}
                  </span>
                  <span className="text-[9.5px] font-semibold" style={{ color: booked ? "rgba(255,255,255,.9)" : view === "tonight" ? "var(--color-success)" : "var(--color-text-muted)" }}>
                    {booked ? booking!.time.slice(0, 5) : view === "tonight" ? "Liber" : `${t.capacityTypical} loc`}
                  </span>
                </div>
              </div>
            );
          })}

          {/* entrance marker */}
          <div className="pointer-events-none absolute bottom-0 left-1/2 flex -translate-x-1/2 flex-col items-center">
            <span className="mb-0.5 text-[10px] uppercase tracking-[0.12em] text-text-muted">Intrare</span>
            <span className="h-1 w-14 rounded-[2px] bg-brand-primary" />
          </div>
        </div>

        {/* inspector */}
        <div className="sticky top-6 rounded-card border border-border bg-surface-white p-5">
          {view === "tonight" ? (
            <TonightInspector tonight={tonight} setSelId={setSelId} sectionColor={sectionColor} tables={tables} />
          ) : !sel ? (
            <EmptyInspector onAdd={addTable} />
          ) : (
            <EditInspector
              key={sel.id}
              table={sel}
              sections={sections}
              onDelete={() => deleteTable(sel.id)}
              onLabel={(v) => { patch(sel.id, { label: v }); }}
              onLabelCommit={(v) => persist(sel.id, { label: v })}
              onSection={(id) => { patch(sel.id, { sectionId: id }); persist(sel.id, { sectionId: id }); }}
              onShape={(shape) => {
                const w = shape === "round" ? 80 : 160;
                const h = 80;
                patch(sel.id, { shape, width: w, height: h });
                persist(sel.id, { shape, width: w, height: h });
              }}
              onCap={(n) => { patch(sel.id, { capacityTypical: n }); persist(sel.id, { capacityTypical: n }); }}
              onOnline={(v) => { patch(sel.id, { isBookableOnline: v }); persist(sel.id, { isBookableOnline: v }); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── inspector: empty ──────────────────────────────────────────────────────────
function EmptyInspector({ onAdd }: { onAdd: () => void }) {
  return (
    <div>
      <h3 className="mb-3 font-display text-lg font-bold text-text-primary">Plan sală</h3>
      <p className="mb-4 text-[13px] leading-relaxed text-text-secondary">
        Atinge o masă pe plan ca să-i editezi detaliile, sau adaugă una nouă.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-1.5 rounded-button bg-brand-primary py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-dark"
      >
        <Plus size={16} /> Adaugă masă
      </button>
      <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-text-muted">
        <Move size={13} /> Trage mesele pentru a le rearanja.
      </p>
    </div>
  );
}

// ── inspector: edit ───────────────────────────────────────────────────────────
function EditInspector({
  table, sections, onDelete, onLabel, onLabelCommit, onSection, onShape, onCap, onOnline,
}: {
  table: EditorTable;
  sections: Section[];
  onDelete: () => void;
  onLabel: (v: string) => void;
  onLabelCommit: (v: string) => void;
  onSection: (id: string) => void;
  onShape: (shape: "round" | "square") => void;
  onCap: (n: number) => void;
  onOnline: (v: boolean) => void;
}) {
  const lab = "mb-1.5 block text-xs font-semibold text-text-secondary";
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-text-primary">Masa {table.label}</h3>
        <button type="button" onClick={onDelete} aria-label="Șterge masa" className="p-1 text-error hover:opacity-80">
          <Trash2 size={16} />
        </button>
      </div>

      <label className={lab}>Etichetă</label>
      <input
        value={table.label}
        onChange={(e) => onLabel(e.target.value)}
        onBlur={(e) => onLabelCommit(e.target.value)}
        className="mb-4 w-full rounded-button border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />

      <label className={lab}>Secțiune</label>
      <div className="mb-4 flex flex-wrap gap-2">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSection(s.id)}
            className="inline-flex items-center gap-1.5 rounded-pill border bg-surface-white px-2.5 py-1.5 text-xs font-semibold text-text-primary"
            style={{ borderColor: table.sectionId === s.id ? (s.color ?? "#9A3412") : "var(--color-border)", borderWidth: table.sectionId === s.id ? 1.5 : 1 }}
          >
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color ?? "#9A3412" }} />
            {s.name}
          </button>
        ))}
      </div>

      <label className={lab}>Formă</label>
      <div className="mb-4 inline-flex rounded-pill border border-border bg-surface-bg p-[3px]">
        {([["round", "Rotundă"], ["square", "Dreptunghi"]] as const).map(([shape, label]) => {
          const active = (shape === "round") === isRound(table.shape);
          return (
            <button
              key={shape}
              type="button"
              onClick={() => onShape(shape)}
              className={`rounded-pill px-3.5 py-1.5 text-[12.5px] font-semibold ${active ? "bg-brand-primary text-white" : "text-text-secondary"}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <label className={lab}>Capacitate</label>
      <div className="mb-4 flex items-center gap-3.5">
        <button type="button" onClick={() => onCap(Math.max(1, table.capacityTypical - 1))} className="flex h-[38px] w-[38px] items-center justify-center rounded-button border border-border bg-surface-white hover:bg-surface-bg">
          <Minus size={16} />
        </button>
        <span className="min-w-[2ch] text-center font-display text-2xl font-bold">{table.capacityTypical}</span>
        <button type="button" onClick={() => onCap(Math.min(14, table.capacityTypical + 1))} className="flex h-[38px] w-[38px] items-center justify-center rounded-button border border-border bg-surface-white hover:bg-surface-bg">
          <Plus size={16} />
        </button>
        <span className="text-[12.5px] text-text-muted">persoane</span>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <div>
          <div className="text-[13.5px] font-semibold">Rezervabil online</div>
          <div className="text-xs text-text-muted">Apare în motorul de rezervări</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={table.isBookableOnline}
          onClick={() => onOnline(!table.isBookableOnline)}
          className="relative h-[26px] w-11 flex-none rounded-full transition-colors"
          style={{ background: table.isBookableOnline ? "var(--color-brand-primary)" : "#D6D3D1" }}
        >
          <span className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all" style={{ left: table.isBookableOnline ? 21 : 3 }} />
        </button>
      </div>
    </div>
  );
}

// ── inspector: tonight ────────────────────────────────────────────────────────
function TonightInspector({
  tonight, setSelId, sectionColor, tables,
}: {
  tonight: Booking[];
  setSelId: (id: string | null) => void;
  sectionColor: (id: string | null) => string;
  tables: EditorTable[];
}) {
  const covers = tonight.reduce((a, b) => a + b.partySize, 0);
  const tableOf = (id: string | null) => tables.find((t) => t.id === id) ?? null;
  return (
    <div>
      <h3 className="mb-3 font-display text-lg font-bold text-text-primary">Diseară</h3>
      <p className="mb-3.5 text-[12.5px] text-text-secondary">
        {tonight.length} rezervări · {covers} acoperiri
      </p>
      {tonight.length === 0 ? (
        <p className="text-[13px] text-text-muted">Nicio rezervare pentru diseară.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tonight.map((b) => {
            const t = tableOf(b.tableId);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => b.tableId && setSelId(b.tableId)}
                className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface-white p-[9px_11px] text-left"
              >
                <span
                  className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ background: t ? sectionColor(t.sectionId) : "#9A3412" }}
                >
                  {t ? t.label : "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold">{b.guestName}</span>
                  <span className="block text-xs text-text-muted">{b.time.slice(0, 5)} · {b.partySize} pers.</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
