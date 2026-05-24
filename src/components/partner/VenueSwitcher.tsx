"use client";

/**
 * §09 §6.2 — venue switcher for partners with access to 2+ venues. Picks the
 * active venue (persisted via setActiveVenueAction), or jumps to the org
 * dashboard. Rendered in the partner sidebar header.
 */
import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronsUpDown, Check, Building2 } from "lucide-react";
import { setActiveVenueAction } from "@/app/partner/(dashboard)/active-venue-actions";

export function VenueSwitcher({
  venues,
  activeVenueId,
}: {
  venues: { id: string; name: string }[];
  activeVenueId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Single venue: nothing to switch — render a plain label.
  if (venues.length < 2) {
    return (
      <div className="px-3 py-2 text-sm font-semibold text-text-primary">
        {venues[0]?.name ?? "—"}
      </div>
    );
  }

  const active = venues.find((v) => v.id === activeVenueId) ?? venues[0];

  function pick(id: string) {
    if (id === active.id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const res = await setActiveVenueAction(id);
      setOpen(false);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-button border border-border bg-surface-white px-3 py-2 text-left text-sm font-semibold text-text-primary hover:bg-surface-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        <span className="truncate">{active.name}</span>
        <ChevronsUpDown size={15} aria-hidden className="shrink-0 text-text-muted" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-card border border-border bg-surface-white py-1 shadow-floating"
        >
          {venues.map((v) => (
            <button
              key={v.id}
              type="button"
              role="option"
              aria-selected={v.id === active.id}
              onClick={() => pick(v.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-bg"
            >
              <span className="truncate">{v.name}</span>
              {v.id === active.id && <Check size={14} aria-hidden className="shrink-0 text-brand-primary" />}
            </button>
          ))}
          <Link
            href="/partner/org"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2 border-t border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-bg hover:text-text-primary"
          >
            <Building2 size={14} aria-hidden /> Panou organizație
          </Link>
        </div>
      )}
    </div>
  );
}
