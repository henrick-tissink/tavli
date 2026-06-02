import type { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { type Locale } from "@/lib/i18n/locale";

interface Props {
  locale: Locale;
  bundle: Record<string, Record<string, unknown>>;
  userEmail: string | null;
  children: ReactNode;
}

export function AdminShell({ locale, bundle, userEmail, children }: Props) {
  return (
    <MessagesProvider locale={locale} bundle={bundle}>
      <div className="min-h-screen desktop:flex bg-surface-bg">
        <AdminSidebar locale={locale} userEmail={userEmail} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </MessagesProvider>
  );
}
