"use client";

/**
 * §12 §8 — change plan. Tier swap (Base ↔ Pro) applies immediately; frequency
 * change is deferred to period-end (no immediate charge), per §8.2/§8.3.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/bottom-sheet";
import { toast } from "@/components/toast";
import { changeTierAction, requestFrequencyChangeAction } from "../actions";

type Tier = "base" | "pro";
type Frequency = "monthly" | "annual";

export function ChangePlanSheet({
  organizationId,
  open,
  onClose,
  currentTier,
  currentFrequency,
  periodEndLabel,
}: {
  organizationId: string;
  open: boolean;
  onClose: () => void;
  currentTier: Tier;
  currentFrequency: Frequency;
  periodEndLabel: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function swapTier(target: Tier) {
    startTransition(async () => {
      const res = await changeTierAction(organizationId, target);
      if (res.ok) {
        toast.success(target === "pro" ? "Ai trecut pe Tavli Pro." : "Ai trecut pe Tavli.");
        onClose();
        router.refresh();
      } else if (res.code === "TV1005") {
        toast.error("Nu poți trece pe Base cu mai mult de o locație. Elimină locațiile suplimentare întâi.");
      } else {
        toast.error("Schimbarea planului nu a reușit.");
      }
    });
  }

  function switchFrequency(target: Frequency) {
    startTransition(async () => {
      const res = await requestFrequencyChangeAction(organizationId, target);
      if (res.ok) {
        toast.success(
          periodEndLabel
            ? `Schimbarea se aplică la ${periodEndLabel}.`
            : "Schimbarea se aplică la finalul perioadei.",
        );
        onClose();
        router.refresh();
      } else {
        toast.error("Schimbarea frecvenței nu a reușit.");
      }
    });
  }

  const otherTier: Tier = currentTier === "pro" ? "base" : "pro";
  const otherFrequency: Frequency = currentFrequency === "annual" ? "monthly" : "annual";

  return (
    <BottomSheet open={open} onClose={onClose} title="Schimbă planul">
      <div className="space-y-6">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Nivel</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Ești pe <span className="font-semibold text-text-primary">{currentTier === "pro" ? "Tavli Pro" : "Tavli"}</span>.
            Schimbarea se aplică imediat.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => swapTier(otherTier)}
            className="mt-3 w-full min-h-[48px] rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card transition-all hover:bg-brand-primary-dark active:scale-[0.99] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            {otherTier === "pro" ? "Trec pe Tavli Pro" : "Trec pe Tavli (Base)"}
          </button>
        </section>

        <section className="border-t border-border pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Frecvență</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Plătești <span className="font-semibold text-text-primary">{currentFrequency === "annual" ? "anual" : "lunar"}</span>.
            Schimbarea se aplică la finalul perioadei{periodEndLabel ? ` (${periodEndLabel})` : ""} — fără plată acum.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => switchFrequency(otherFrequency)}
            className="mt-3 w-full min-h-[48px] rounded-button border border-border bg-surface-white px-6 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            {otherFrequency === "annual" ? "Cere trecerea la plată anuală (2 luni gratuite)" : "Cere trecerea la plată lunară"}
          </button>
        </section>
      </div>
    </BottomSheet>
  );
}
