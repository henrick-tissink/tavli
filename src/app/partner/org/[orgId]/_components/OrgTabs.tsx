"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function OrgTabs({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const base = `/partner/org/${orgId}`;
  const tabs = [
    { href: base, label: "Prezentare", match: (p: string) => p === base },
    { href: `${base}/venues`, label: "Locații", match: (p: string) => p.startsWith(`${base}/venues`) },
    { href: `${base}/analytics`, label: "Analize", match: (p: string) => p.startsWith(`${base}/analytics`) },
  ];
  return (
    <nav className="flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={[
              "relative -mb-px border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
              active
                ? "border-brand-primary text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
