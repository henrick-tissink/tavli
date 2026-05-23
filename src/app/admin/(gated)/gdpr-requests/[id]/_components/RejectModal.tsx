"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rejectDsrAction } from "../actions";

export function RejectModal({ dsrId }: { dsrId: string }) {
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
        alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 hover:bg-stone-50">
        Reject request
      </button>
      <dialog ref={dialogRef} className="rounded-md border border-stone-200 p-6 backdrop:bg-stone-900/50">
        <h3 className="text-lg font-semibold">Reject request</h3>
        <p className="mt-2 text-sm text-stone-600">Why is this request being rejected? (E.g., identity could not be verified.)</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-4 w-full rounded-md border border-stone-300 p-2 text-sm"
          rows={4}
          placeholder="Rejection reason (mandatory)"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-md border border-stone-300 px-4 py-2 text-sm">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !reason.trim()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {pending ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </dialog>
    </>
  );
}
