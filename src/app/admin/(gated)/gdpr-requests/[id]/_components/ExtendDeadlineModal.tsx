"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { extendDeadlineAction } from "../actions";

export function ExtendDeadlineModal({ dsrId }: { dsrId: string }) {
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
        alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 hover:bg-stone-50">
        Extend deadline
      </button>
      <dialog ref={dialogRef} className="rounded-md border border-stone-200 p-6 backdrop:bg-stone-900/50">
        <h3 className="text-lg font-semibold">Extend deadline</h3>
        <p className="mt-2 text-sm text-stone-600">
          GDPR Art 12(3) allows up to 2 months extension; Tavli policy caps at 14 days. Mandatory reason.
        </p>
        <div className="mt-4 flex items-end gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-stone-500">Days (1-14)</span>
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
          placeholder="Extension reason (mandatory)"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-md border border-stone-300 px-4 py-2 text-sm">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || days < 1 || days > 14 || !reason.trim()}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {pending ? "Saving…" : "Extend"}
          </button>
        </div>
      </dialog>
    </>
  );
}
