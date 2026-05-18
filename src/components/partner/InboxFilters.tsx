"use client";
import { useRouter, useSearchParams } from "next/navigation";

const STATUSES = [
  {
    key: "open",
    label: "Active",
    statuses: ["new", "viewing", "replied", "quoted"],
  },
  { key: "new", label: "Nou", statuses: ["new"] },
  { key: "viewing", label: "În lucru", statuses: ["viewing"] },
  { key: "quoted", label: "Cu ofertă", statuses: ["quoted"] },
  { key: "accepted", label: "Acceptate", statuses: ["accepted"] },
  { key: "all", label: "Toate", statuses: [] },
];

export function InboxFilters({ active }: { active: string }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {STATUSES.map((s) => (
        <button
          key={s.key}
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            next.set("status", s.key);
            router.push(`?${next.toString()}`);
          }}
          className={`text-sm px-3 py-1.5 rounded-full ${active === s.key ? "bg-brand-primary text-white" : "bg-surface-bg hover:bg-border"}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
