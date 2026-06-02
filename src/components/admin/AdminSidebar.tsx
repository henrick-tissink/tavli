"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Store, Mail, LogOut, Menu, X } from "lucide-react";
import { signOutAdmin } from "@/app/(app)/admin/sign-in/actions";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { useT } from "@/lib/i18n/messages-provider";
import { type Locale } from "@/lib/i18n/locale";

const NAV = [
  { href: "/admin", key: "dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/restaurants", key: "restaurants", icon: Store, exact: false },
  { href: "/admin/invitations", key: "invitations", icon: Mail, exact: false },
] as const;

export function AdminSidebar({
  locale,
  userEmail,
}: {
  locale: Locale;
  userEmail: string | null;
}) {
  const t = useT("admin.common");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const navContent = (
    <>
      <div className="px-5 py-6">
        <Link
          href="/admin"
          className="font-display text-2xl font-bold text-brand-primary tracking-tight"
        >
          Tavli
        </Link>
        <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
          {t("nav.eyebrow")}
        </p>
      </div>
      <nav className="flex-1 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-primary-soft text-brand-primary-dark"
                      : "text-text-secondary hover:bg-surface-bg"
                  }`}
                >
                  <Icon size={16} />
                  {t(`nav.items.${item.key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="px-4 py-4 border-t border-border">
        <div className="mb-3">
          <LocaleSwitcher mode="preference" current={locale} />
        </div>
        {userEmail && (
          <p className="text-xs text-text-muted truncate mb-2">{userEmail}</p>
        )}
        <form action={signOutAdmin}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-bg transition-colors"
          >
            <LogOut size={16} />
            {t("nav.signOut")}
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden desktop:flex w-60 shrink-0 h-screen sticky top-0 bg-surface-white border-r border-border flex-col">
        {navContent}
      </aside>

      <header className="desktop:hidden sticky top-0 z-30 flex items-center justify-between bg-surface-white border-b border-border px-4 h-14">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("nav.openNav")}
          className="p-2 -ml-2 rounded-lg hover:bg-surface-bg text-text-secondary"
        >
          <Menu size={20} />
        </button>
        <Link
          href="/admin"
          className="font-display text-xl font-bold text-brand-primary tracking-tight"
        >
          Tavli
        </Link>
        <span className="w-10" aria-hidden />
      </header>

      {open && (
        <div className="desktop:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label={t("nav.closeNav")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="relative w-72 max-w-[85vw] h-full bg-surface-white border-r border-border flex flex-col animate-slide-in-left">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("nav.closeNav")}
              className="absolute top-3 right-3 p-2 rounded-lg hover:bg-surface-bg text-text-secondary"
            >
              <X size={18} />
            </button>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
