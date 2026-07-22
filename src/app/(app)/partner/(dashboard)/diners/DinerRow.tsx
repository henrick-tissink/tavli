"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Table row for the diners list. The whole row is clickable (not just the
 * guest-name cell) so the row-wide hover highlight actually navigates. The
 * name stays a real `<Link>` for accessibility; its click stops propagation
 * so the row's onClick doesn't double-navigate to the same profile.
 */
export function DinerRow({
  href,
  fullName,
  phoneMasked,
  emailMasked,
  visitCount,
  lastVisitLabel,
}: {
  href: string;
  fullName: string | null;
  phoneMasked: string;
  emailMasked: string;
  visitCount: number;
  lastVisitLabel: string;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
      role="link"
      tabIndex={0}
      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-bg"
    >
      <td className="px-4 py-3">
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-text-primary hover:text-brand-primary"
        >
          {fullName ?? "—"}
        </Link>
      </td>
      <td className="px-4 py-3 text-text-muted">
        <div>{phoneMasked}</div>
        <div className="text-xs">{emailMasked}</div>
      </td>
      <td className="px-4 py-3 text-text-secondary">{visitCount}</td>
      <td className="px-4 py-3 text-text-muted">{lastVisitLabel}</td>
    </tr>
  );
}
