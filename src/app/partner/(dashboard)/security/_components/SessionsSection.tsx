"use client";

import { useTransition } from "react";

export interface SessionsActions {
  signOutEverywhereAction: () => Promise<void>;
}

export function SessionsSection({ actions }: { actions: SessionsActions }) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const confirmed = window.confirm(
      "Sign out from every device, including this one?",
    );
    if (!confirmed) return;
    startTransition(() => actions.signOutEverywhereAction());
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl text-text-primary">Active sessions</h2>
      <p className="text-text-secondary">
        Sign out of every device you&apos;re signed in on, including this one.
      </p>
      <button
        onClick={onClick}
        disabled={isPending}
        className="rounded-button border border-border px-4 py-2 text-sm font-medium hover:bg-surface-bg disabled:opacity-50"
      >
        {isPending ? "Signing out…" : "Sign out everywhere"}
      </button>
    </section>
  );
}
