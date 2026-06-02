"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { formatDate } from "@/lib/i18n/format";
import { retryErasureCascadeAction } from "../actions";

const DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "numeric",
};

export function FailureBanner({ dsrId, recordedAt }: { dsrId: string; recordedAt: Date }) {
  const t = useT("admin.gdpr");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function retry() {
    if (!confirm(t("failureBanner.retryConfirm"))) return;
    startTransition(async () => {
      try {
        await retryErasureCascadeAction(dsrId);
        router.refresh();
      } catch (e) {
        alert(t("failureBanner.retryFailed", { error: e instanceof Error ? e.message : String(e) }));
      }
    });
  }

  return (
    <div className="mb-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-red-900">{t("failureBanner.title")}</p>
          <p className="mt-1 text-red-800">
            {t("failureBanner.body", { at: formatDate(recordedAt, locale, DATE_TIME_OPTS) })}
          </p>
        </div>
        <button
          type="button"
          onClick={retry}
          disabled={pending}
          className="shrink-0 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {pending ? t("failureBanner.retryPending") : t("failureBanner.retry")}
        </button>
      </div>
    </div>
  );
}
