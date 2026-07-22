"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Table row for the diners list. Row-wide click is a POINTER-ONLY enhancement
 * (so the hover highlight actually navigates) — the row keeps its native table
 * semantics (no role override, no tab stop). The guest-name `<Link>` remains the
 * accessible keyboard/AT affordance; it stops propagation so a click on it
 * doesn't also fire the row's onClick.
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
