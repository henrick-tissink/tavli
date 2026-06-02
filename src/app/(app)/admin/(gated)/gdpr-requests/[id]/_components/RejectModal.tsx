"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/messages-provider";
import { rejectDsrAction } from "../actions";

export function RejectModal({ dsrId }: { dsrId: string }) {
  const t = useT("admin.gdpr");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function open() { dialogRef.current?.showModal(); }
  function close() { dialogRef.current?.close(); }

  function submit() {
    if (!reason.trim()) return;
    startTransition(async () => {
      try {
        await rejectDsrAction(dsrId, reason);
        close();
        setReason("");
        router.refresh();
      } catch (e) {
        alert(t("reject.failed", { error: e instanceof Error ? e.message : String(e) }));
      }
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 hover:bg-stone-50">
        {t("reject.trigger")}
      </button>
      <dialog ref={dialogRef} className="rounded-md border border-stone-200 p-6 backdrop:bg-stone-900/50">
        <h3 className="text-lg font-semibold">{t("reject.title")}</h3>
        <p className="mt-2 text-sm text-stone-600">{t("reject.body")}</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-4 w-full rounded-md border border-stone-300 p-2 text-sm"
          rows={4}
          placeholder={t("reject.placeholder")}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-md border border-stone-300 px-4 py-2 text-sm">{t("reject.cancel")}</button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !reason.trim()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {pending ? t("reject.submitPending") : t("reject.submit")}
          </button>
        </div>
      </dialog>
    </>
  );
}
