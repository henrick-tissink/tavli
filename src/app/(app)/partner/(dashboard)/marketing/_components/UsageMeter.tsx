"use client";

import { useEffect, useState } from "react";
import { Mail, MessageSquare, Phone, type LucideIcon } from "lucide-react";

// Icon components can't cross the server→client boundary, so the server passes
// a channel key and we resolve the icon here.
const CHANNEL_ICON: Record<string, LucideIcon> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: Phone,
  in_confirmation: Mail,
};

interface Props {
  label: string;
  channel: string;
  sent: number;
  allowance: number;
  /** "{count} left" template — {count} is interpolated here. */
  leftLabel: string;
}

/**
 * A single channel quota meter: big sent/allowance figure over an animated
 * fill bar. The bar grows from 0 on mount so the page reads as live, and the
 * tone shifts brand → amber → red as usage approaches and passes the included
 * allowance (mirrors the §11 80% / 100% quota-alert thresholds).
 */
export function UsageMeter({ label, channel, sent, allowance, leftLabel }: Props) {
  const Icon = CHANNEL_ICON[channel] ?? Mail;
  const pct = allowance > 0 ? Math.min(100, Math.round((sent / allowance) * 100)) : 0;
  const tone = pct >= 100 ? "over" : pct >= 80 ? "near" : "ok";
  const left = Math.max(0, allowance - sent);

  // Grow the fill from 0 on the first paint for a live feel; respects
  // prefers-reduced-motion via the CSS transition (disabled globally there).
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFill(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const barColor =
    tone === "over" ? "bg-error" : tone === "near" ? "bg-amber-500" : "bg-brand-primary";
  const numberColor = tone === "over" ? "text-error" : "text-text-primary";

  return (
    <div className="rounded-card border border-border bg-surface-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</p>
        <Icon size={16} className="text-text-muted" aria-hidden />
      </div>

      <p className={`mt-3 font-display text-3xl font-bold leading-none tabular-nums ${numberColor}`}>
        {sent.toLocaleString()}
        <span className="text-lg font-normal text-text-muted"> / {allowance.toLocaleString()}</span>
      </p>

      <div
        className="mt-4 h-2 overflow-hidden rounded-pill bg-surface-bg"
        role="progressbar"
        aria-valuenow={sent}
        aria-valuemin={0}
        aria-valuemax={allowance}
        aria-label={label}
      >
        <div
          className={`h-full rounded-pill transition-[width] duration-700 ease-out ${barColor}`}
          style={{ width: `${fill}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-text-secondary">
        {leftLabel.replace("{count}", left.toLocaleString())}
      </p>
    </div>
  );
}
