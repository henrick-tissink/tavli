"use client";

import { useTransition } from "react";
import { useT } from "@/lib/i18n/messages-provider";

export interface SessionsActions {
  signOutEverywhereAction: () => Promise<void>;
}

export function SessionsSection({ actions }: { actions: SessionsActions }) {
  const t = useT("partner.staffSecurity");
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const confirmed = window.confirm(t("security.sessions.confirm"));
    if (!confirmed) return;
    startTransition(() => actions.signOutEverywhereAction());
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl text-text-primary">{t("security.sessions.title")}</h2>
      <p className="text-text-secondary">
        {t("security.sessions.intro")}
      </p>
      <button
        onClick={onClick}
        disabled={isPending}
        className="rounded-button border border-border px-4 py-2 text-sm font-medium hover:bg-surface-bg disabled:opacity-50"
      >
        {isPending ? t("security.sessions.signingOut") : t("security.sessions.signOut")}
      </button>
    </section>
  );
}
