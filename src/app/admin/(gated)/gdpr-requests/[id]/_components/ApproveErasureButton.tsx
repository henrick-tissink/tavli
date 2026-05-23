"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveErasureAction } from "../actions";

export function ApproveErasureButton({ dsrId, enabled }: { dsrId: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!enabled || pending) return;
    if (!confirm("Approve erasure? This triggers an irreversible cascade across diner/reservation/review/audit data.")) return;
    startTransition(async () => {
      try {
        await approveErasureAction(dsrId);
        router.refresh();
      } catch (e) {
        alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!enabled || pending}
      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-stone-300"
    >
      {pending ? "Approving cascade…" : "Approve erasure"}
    </button>
  );
}
