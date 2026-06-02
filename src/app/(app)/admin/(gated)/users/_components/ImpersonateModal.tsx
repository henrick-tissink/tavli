"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/messages-provider";
import { impersonateAction } from "../actions";

export function ImpersonateModal({
  targetUserId,
  targetEmail,
}: {
  targetUserId: string;
  targetEmail: string;
}) {
  const t = useT("admin.users");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-brand-primary hover:underline"
      >
        {t("impersonate.trigger")}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center">
      <div className="bg-white rounded-card p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold">
          {t("impersonate.title", { email: targetEmail })}
        </h2>
        <p className="text-sm text-text-secondary mt-2">
          {t("impersonate.body", { email: targetEmail })}
        </p>
        <form action={impersonateAction} className="mt-4 space-y-3">
          <input type="hidden" name="target_user_id" value={targetUserId} />
          <label className="block text-sm">
            {t("impersonate.reasonLabel")}
            <textarea
              name="reason"
              maxLength={200}
              rows={3}
              placeholder={t("impersonate.reasonPlaceholder")}
              className="mt-1 block w-full rounded-button border border-border px-3 py-2"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-button border border-border px-4 py-2 text-sm font-medium hover:bg-surface-bg"
            >
              {t("impersonate.cancel")}
            </button>
            <button
              type="submit"
              className="rounded-button bg-brand-primary px-4 py-2 text-white text-sm font-medium hover:bg-brand-primary-dark"
            >
              {t("impersonate.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
