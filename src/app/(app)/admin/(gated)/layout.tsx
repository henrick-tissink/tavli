import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { buildBundle } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function AdminGatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  if (!session || session.profile.role !== "admin") {
    redirect("/admin/sign-in");
  }
  const locale = await resolveAppLocale();
  const bundle = buildBundle(locale, [
    "admin.common",
    "admin.dashboard",
    "admin.restaurants",
    "admin.invitations",
    "admin.reviews",
    "admin.gdpr",
  ]);
  return (
    <AdminShell locale={locale} bundle={bundle} userEmail={session.userEmail}>
      {children}
    </AdminShell>
  );
}
