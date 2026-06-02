"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/messages-provider";
import { extendDeadlineAction } from "../actions";

export function ExtendDeadlineModal({ dsrId }: { dsrId: string }) {
  const t = useT("admin.gdpr");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function open() { dialogRef.current?.showModal(); }
  function close() { dialogRef.current?.close(); }

  function submit() {
    if (days < 1 || days > 14 || !reason.trim()) return;
    startTransition(async () => {
      try {
        await extendDeadlineAction(dsrId, days, reason);
        close();
        setReason("");
        router.refresh();
      } catch (e) {
        alert(t("extendDeadline.failed", { error: e instanceof Error ? e.message : String(e) }));
      }
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 hover:bg-stone-50">
        {t("extendDeadline.trigger")}
      </button>
      <dialog ref={dialogRef} className="rounded-md border border-stone-200 p-6 backdrop:bg-stone-900/50">
        <h3 className="text-lg font-semibold">{t("extendDeadline.title")}</h3>
        <p className="mt-2 text-sm text-stone-600">{t("extendDeadline.body")}</p>
        <div className="mt-4 flex items-end gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-stone-500">{t("extendDeadline.daysLabel")}</span>
            <input
              type="number"
              min={1}
              max={14}
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10) || 0)}
              className="mt-1 w-24 rounded-md border border-stone-300 p-2 text-sm"
            />
          </label>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-4 w-full rounded-md border border-stone-300 p-2 text-sm"
          rows={3}
          placeholder={t("extendDeadline.placeholder")}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-md border border-stone-300 px-4 py-2 text-sm">{t("extendDeadline.cancel")}</button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || days < 1 || days > 14 || !reason.trim()}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {pending ? t("extendDeadline.submitPending") : t("extendDeadline.submit")}
          </button>
        </div>
      </dialog>
    </>
  );
}
