"use client";

/**
 * §08 — drag-drop floor-plan canvas (replaces number-input positioning). Tables
 * render as positioned shapes; dragging persists position_x/position_y via
 * updateTableAction. Pointer-events based, so it works with mouse + touch.
 */
import { useRef, useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { updateTableAction } from "../actions";

interface FloorTable {
  id: string;
  label: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  shape: string;
  sectionId: string | null;
}

const CANVAS_H = 520;

export function FloorPlanCanvas({
  restaurantId,
  organizationId,
  tables,
  sectionColors,
}: {
  restaurantId: string;
  organizationId: string;
  tables: FloorTable[];
  sectionColors: Record<string, string | null>;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(tables.map((t) => [t.id, { x: t.positionX, y: t.positionY }])),
  );
  const [, startTransition] = useTransition();

  function coords() {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { left: rect.left, top: rect.top, w: rect.width };
  }

  function onPointerDown(e: React.PointerEvent, t: FloorTable) {
    const c = coords();
    drag.current = { id: t.id, offX: e.clientX - c.left - (pos[t.id]?.x ?? 0), offY: e.clientY - c.top - (pos[t.id]?.y ?? 0) };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent, t: FloorTable) {
    if (drag.current?.id !== t.id) return;
    const c = coords();
    const x = Math.max(0, Math.min(c.w - t.width, Math.round(e.clientX - c.left - drag.current.offX)));
    const y = Math.max(0, Math.min(CANVAS_H - t.height, Math.round(e.clientY - c.top - drag.current.offY)));
    setPos((p) => ({ ...p, [t.id]: { x, y } }));
  }

  function onPointerUp(e: React.PointerEvent, t: FloorTable) {
    if (drag.current?.id !== t.id) return;
    drag.current = null;
    const next = pos[t.id];
    startTransition(async () => {
      const res = await updateTableAction({
        id: t.id,
        restaurantId,
        organizationId,
        changes: { positionX: next.x, positionY: next.y },
      });
      if (!res.ok) toast.error("Poziția nu a fost salvată.");
    });
  }

  if (tables.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border p-10 text-center text-sm text-text-muted">
        Adaugă mese mai jos ca să le aranjezi vizual.
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      className="relative w-full overflow-hidden rounded-card border border-border bg-surface-white"
      style={{
        height: CANVAS_H,
        backgroundImage:
          "linear-gradient(#E7E5E4 1px, transparent 1px), linear-gradient(90deg, #E7E5E4 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        touchAction: "none",
      }}
    >
      {tables.map((t) => {
        const p = pos[t.id] ?? { x: t.positionX, y: t.positionY };
        const color = (t.sectionId && sectionColors[t.sectionId]) || "#FFF7ED";
        return (
          <button
            key={t.id}
            type="button"
            onPointerDown={(e) => onPointerDown(e, t)}
            onPointerMove={(e) => onPointerMove(e, t)}
            onPointerUp={(e) => onPointerUp(e, t)}
            className="absolute flex cursor-grab touch-none select-none items-center justify-center border border-brand-primary/40 text-xs font-bold text-text-primary shadow-card active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            style={{
              left: p.x,
              top: p.y,
              width: t.width,
              height: t.height,
              background: color,
              borderRadius: t.shape === "round" ? "9999px" : "8px",
            }}
            aria-label={`Masa ${t.label}, trage pentru a repoziționa`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
