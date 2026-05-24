"use client";

/**
 * Shared chart primitives for the analytics dashboard. Recharts styled to the
 * Tavli house system — warm stone neutrals + the orange accent, Fraunces for
 * section titles, no default blue/grid clutter. Editorial, not admin-panel.
 */
import type { ReactNode } from "react";

// Sequential warm palette (orange → terracotta → stone) for categorical series.
export const SERIES = ["#F97316", "#EA580C", "#C2410C", "#9A3412", "#78716C", "#A8A29E", "#D6D3D1"];
export const ACCENT = "#F97316";
export const GRID = "#E7E5E4";
export const AXIS = "#A8A29E";

/** A titled, editorial card frame for each chart. */
export function ChartCard({
  title,
  kicker,
  children,
  span,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  span?: "full" | "half";
}) {
  return (
    <section
      className={`bg-surface-white rounded-card border border-border p-6 ${
        span === "full" ? "desktop:col-span-2" : ""
      }`}
    >
      <header className="mb-5">
        {kicker && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-primary mb-1">
            {kicker}
          </p>
        )}
        <h3 className="font-display text-xl font-bold text-text-primary leading-tight">{title}</h3>
      </header>
      {children}
    </section>
  );
}

/** Placeholder used when a chart has no data yet (§7.1.1). */
export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border bg-surface-bg/60 px-6 text-center">
      <p className="text-sm text-text-muted max-w-xs leading-relaxed">{message}</p>
    </div>
  );
}

/** Small-sample caution footnote. */
export function SmallSampleNote() {
  return (
    <p className="mt-3 text-xs text-text-muted italic">
      Eșantion mic — interpretează cu prudență.
    </p>
  );
}

interface TooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
}

/** Editorial tooltip — stone card, orange rule, no default Recharts chrome. */
export function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-white px-3 py-2 shadow-card">
      {label != null && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
      )}
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold text-text-primary">
          <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: entry.color ?? ACCENT }} />
          {entry.name ? `${entry.name}: ` : ""}
          {entry.value}
          {unit ?? ""}
        </p>
      ))}
    </div>
  );
}
