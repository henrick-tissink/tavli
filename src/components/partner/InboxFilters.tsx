"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/messages-provider";

const STATUS_KEYS = ["open", "new", "viewing", "quoted", "accepted", "all"] as const;

export function InboxFilters({ active }: { active: string }) {
  const t = useT("partner.corporate");
  const router = useRouter();
  const params = useSearchParams();
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {STATUS_KEYS.map((key) => (
        <button
          key={key}
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            next.set("status", key);
            router.push(`?${next.toString()}`);
          }}
          className={`text-sm px-3 py-1.5 rounded-full ${active === key ? "bg-brand-primary text-white" : "bg-surface-bg hover:bg-border"}`}
        >
          {t(`filters.${key}`)}
        </button>
      ))}
    </div>
  );
}
