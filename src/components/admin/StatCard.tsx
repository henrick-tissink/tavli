import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "muted";
  hint?: string;
}

const TONES = {
  default: "bg-surface-white text-text-primary",
  success: "bg-emerald-50 text-emerald-900",
  warning: "bg-amber-50 text-amber-900",
  muted: "bg-surface-bg text-text-secondary",
} as const;

export function StatCard({ label, value, icon: Icon, tone = "default", hint }: Props) {
  return (
    <div className={`rounded-card p-5 border border-border ${TONES[tone]}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
          {label}
        </p>
        {Icon && <Icon size={18} className="opacity-60" />}
      </div>
      <p className="font-display text-[40px] font-bold leading-none mt-3">
        {value}
      </p>
      {hint && <p className="text-xs mt-1 opacity-70">{hint}</p>}
    </div>
  );
}
