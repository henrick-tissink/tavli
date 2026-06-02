"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/messages-provider";
import { resolveDinerAction } from "../actions";

export function ResolveDinerModal({ dsrId }: { dsrId: string }) {
  const t = useT("admin.gdpr");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dinerIdsCsv, setDinerIdsCsv] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function open() { dialogRef.current?.showModal(); }
  function close() { dialogRef.current?.close(); }

  function submit() {
    const ids = dinerIdsCsv.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return;
    startTransition(async () => {
      try {
        await resolveDinerAction(dsrId, ids);
        close();
        setDinerIdsCsv("");
        router.refresh();
      } catch (e) {
        alert(t("resolveDiner.failed", { error: e instanceof Error ? e.message : String(e) }));
      }
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 hover:bg-stone-50">
        {t("resolveDiner.trigger")}
      </button>
      <dialog ref={dialogRef} className="rounded-md border border-stone-200 p-6 backdrop:bg-stone-900/50">
        <h3 className="text-lg font-semibold">{t("resolveDiner.title")}</h3>
        <p className="mt-2 text-sm text-stone-600">{t("resolveDiner.body")}</p>
        <input
          type="text"
          value={dinerIdsCsv}
          onChange={(e) => setDinerIdsCsv(e.target.value)}
          className="mt-4 w-full rounded-md border border-stone-300 p-2 font-mono text-sm"
          placeholder={t("resolveDiner.placeholder")}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-md border border-stone-300 px-4 py-2 text-sm">{t("resolveDiner.cancel")}</button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !dinerIdsCsv.trim()}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {pending ? t("resolveDiner.submitPending") : t("resolveDiner.submit")}
          </button>
        </div>
      </dialog>
    </>
  );
}
