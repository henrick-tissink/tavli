"use client";
import { useOptimistic, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/spinner";
import { useT } from "@/lib/i18n/messages-provider";

const STATUS_KEYS = ["open", "new", "viewing", "quoted", "accepted", "all"] as const;

export function InboxFilters({ active }: { active: string }) {
  const t = useT("partner.corporate");
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  // The inbox is force-dynamic, so the push takes a server round-trip. Without
  // this the clicked pill stayed inert until the new page landed; the optimistic
  // value is discarded when the transition ends, which is also the revert.
  const [optimisticActive, setOptimisticActive] = useOptimistic(active);
  return (
    <div className="flex flex-wrap gap-2 mb-4" aria-busy={pending || undefined}>
      {STATUS_KEYS.map((key) => {
        const isActive = optimisticActive === key;
        return (
          <button
            key={key}
            onClick={() => {
              const next = new URLSearchParams(params.toString());
              next.set("status", key);
              startTransition(() => {
                setOptimisticActive(key);
                router.push(`?${next.toString()}`);
              });
            }}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full ${isActive ? "bg-brand-primary text-white" : "bg-surface-bg hover:bg-border"}`}
          >
            {/* Reduced motion freezes the spin, so the pill's active colouring
                is the signal that carries on its own. */}
            {pending && isActive && <Spinner size={13} />}
            {t(`filters.${key}`)}
          </button>
        );
      })}
    </div>
  );
}
