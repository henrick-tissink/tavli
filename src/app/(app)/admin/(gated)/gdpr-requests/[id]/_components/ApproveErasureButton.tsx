"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/messages-provider";
import { approveErasureAction } from "../actions";

export function ApproveErasureButton({ dsrId, enabled }: { dsrId: string; enabled: boolean }) {
  const t = useT("admin.gdpr");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!enabled || pending) return;
    if (!confirm(t("approveErasure.confirm"))) return;
    startTransition(async () => {
      try {
        await approveErasureAction(dsrId);
        router.refresh();
      } catch (e) {
        alert(t("approveErasure.failed", { error: e instanceof Error ? e.message : String(e) }));
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
      {pending ? t("approveErasure.pending") : t("approveErasure.approve")}
    </button>
  );
}
