"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/messages-provider";

export function OrgTabs({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const t = useT("partner.org");
  const base = `/partner/org/${orgId}`;
  const tabs = [
    { href: base, label: t("tabs.overview"), match: (p: string) => p === base },
    { href: `${base}/venues`, label: t("tabs.venues"), match: (p: string) => p.startsWith(`${base}/venues`) },
    { href: `${base}/members`, label: t("tabs.members"), match: (p: string) => p.startsWith(`${base}/members`) },
    { href: `${base}/analytics`, label: t("tabs.analytics"), match: (p: string) => p.startsWith(`${base}/analytics`) },
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
