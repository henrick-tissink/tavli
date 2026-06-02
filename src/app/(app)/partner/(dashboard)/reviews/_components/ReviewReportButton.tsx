"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/bottom-sheet";
import { toast } from "@/components/toast";
import { useT } from "@/lib/i18n/messages-provider";
import { reportReviewAction } from "../actions";
import type { ReportReason } from "@/lib/reviews/moderation";

const REASON_VALUES: ReportReason[] = [
  "inappropriate",
  "fake",
  "spam",
  "off_topic",
  "personal_attack",
  "gdpr_takedown",
];

export function ReviewReportButton({ reviewId }: { reviewId: string }) {
  const t = useT("partner.reviews");
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
        toast.success(t("report.toastSuccess"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error(t("report.toastError"));
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
        {t("report.trigger")}
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("report.sheetTitle")}>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-text-secondary">
            {t("report.intro")}
          </p>
          <select name="reason" required defaultValue="" className={inputCls} aria-label={t("report.reasonAriaLabel")}>
            <option value="" disabled>
              {t("report.reasonPlaceholder")}
            </option>
            {REASON_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`report.reasons.${value}`)}
              </option>
            ))}
          </select>
          <textarea name="details" rows={3} placeholder={t("report.detailsPlaceholder")} className={`${inputCls} resize-none`} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-[44px] items-center rounded-button bg-text-primary px-5 py-2.5 text-sm font-bold text-surface-white hover:bg-text-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            {t("report.submit")}
          </button>
        </form>
      </BottomSheet>
    </>
  );
}
