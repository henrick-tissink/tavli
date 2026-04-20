import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";

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
  return <AdminShell userEmail={session.userEmail}>{children}</AdminShell>;
}
