"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveErasureAction } from "../actions";

export function FailureBanner({ dsrId, recordedAt }: { dsrId: string; recordedAt: Date }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function retry() {
    if (!confirm("Retry the cascade? Handlers are idempotent — completed work won't be repeated.")) return;
    startTransition(async () => {
      try {
        await approveErasureAction(dsrId);
        router.refresh();
      } catch (e) {
        alert(`Retry failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <div className="mb-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-red-900">Cascade failed</p>
          <p className="mt-1 text-red-800">
            Last failure at {recordedAt.toLocaleString()}. Inspect the worker logs for the failing handler.
            Re-running the orchestrator is safe — handlers are individually idempotent.
          </p>
        </div>
        <button
          type="button"
          onClick={retry}
          disabled={pending}
          className="shrink-0 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {pending ? "Retrying…" : "Retry cascade"}
        </button>
      </div>
    </div>
  );
}
