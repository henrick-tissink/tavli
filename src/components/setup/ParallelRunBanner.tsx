"use client";

/**
 * §14 §7.1 / §7.3 — the parallel-run banner. Dismissible per session; shows the
 * "keep your old system live" coaching message + a "make Tavli authoritative"
 * CTA that calls the consolidate action. Operational-only (no data mirror).
 */
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/button";

export function ParallelRunBanner({
  onConsolidate,
}: {
  onConsolidate: () => Promise<{ ok: boolean }>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (dismissed || done) return null;

  return (
    <div className="relative rounded-card border border-border bg-brand-primary-soft p-5">
      <button
        onClick={() => setDismissed(true)}
        aria-label="Închide"
        className="absolute right-3 top-3 text-text-muted hover:text-text-primary"
      >
        <X size={18} />
      </button>
      <p className="font-display text-lg font-bold text-text-primary">Rulezi în paralel cu sistemul vechi?</p>
      <p className="mt-1 max-w-2xl text-sm text-text-secondary leading-relaxed">
        Păstrează-l activ 30 de zile ca plasă de siguranță. Când ești gata să consolidezi, importă
        rezervările istorice prin import CSV — aduce totul în Tavli dintr-o singură mișcare.
      </p>
      <Button
        variant="secondary"
        className="mt-4"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await onConsolidate();
          setBusy(false);
          if (r.ok) setDone(true);
        }}
      >
        {busy ? "Se procesează…" : "Tavli devine sistemul principal"}
      </Button>
    </div>
  );
}
