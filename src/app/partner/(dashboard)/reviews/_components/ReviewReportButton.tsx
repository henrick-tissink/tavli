"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/bottom-sheet";
import { toast } from "@/components/toast";
import { reportReviewAction } from "../actions";
import type { ReportReason } from "@/lib/reviews/moderation";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "inappropriate", label: "Conținut nepotrivit" },
  { value: "fake", label: "Recenzie falsă" },
  { value: "spam", label: "Spam" },
  { value: "off_topic", label: "În afara subiectului" },
  { value: "personal_attack", label: "Atac la persoană" },
  { value: "gdpr_takedown", label: "Solicitare GDPR" },
];

export function ReviewReportButton({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const reason = form.get("reason") as ReportReason;
    const details = String(form.get("details") ?? "");
    startTransition(async () => {
      const res = await reportReviewAction(reviewId, reason, details);
      if (res.ok) {
        toast.success("Recenzie raportată. O verificăm.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error("Raportarea nu a reușit.");
      }
    });
  }

  const inputCls =
    "w-full rounded-button border border-border bg-surface-white px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-text-muted hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
      >
        Raportează
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Raportează recenzia">
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-text-secondary">
            Trimitem raportul către echipa Tavli. Recenziile sunt eliminate doar dacă încalcă regulile.
          </p>
          <select name="reason" required defaultValue="" className={inputCls} aria-label="Motiv">
            <option value="" disabled>
              Alege motivul…
            </option>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea name="details" rows={3} placeholder="Detalii (opțional)" className={`${inputCls} resize-none`} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-[44px] items-center rounded-button bg-text-primary px-5 py-2.5 text-sm font-bold text-surface-white hover:bg-text-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            Trimite raportul
          </button>
        </form>
      </BottomSheet>
    </>
  );
}
