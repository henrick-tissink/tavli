import Link from "next/link";
import { CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

export interface ChecklistItem {
  label: string;
  hint?: string;
  done: boolean;
  href: string;
}

export function ContentHealthChecklist({ items }: { items: ChecklistItem[] }) {
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="bg-surface-white rounded-card border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-text-primary">
            Stare conținut
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            {doneCount}/{items.length} finalizate
          </p>
        </div>
        <div className="w-32">
          <div className="h-1.5 bg-surface-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary transition-all"
              style={{ width: `${(doneCount / items.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="flex items-center gap-3 px-5 py-3 hover:bg-surface-bg/50 transition-colors group"
            >
              {item.done ? (
                <CheckCircle2
                  size={18}
                  className="text-emerald-600 flex-shrink-0"
                />
              ) : (
                <AlertCircle
                  size={18}
                  className="text-amber-500 flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    item.done
                      ? "text-text-secondary line-through"
                      : "text-text-primary"
                  }`}
                >
                  {item.label}
                </p>
                {item.hint && !item.done && (
                  <p className="text-xs text-text-muted mt-0.5">{item.hint}</p>
                )}
              </div>
              {!item.done && (
                <ArrowRight
                  size={16}
                  className="text-text-muted group-hover:text-brand-primary transition-colors"
                />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
