import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/server";
import { PartnerShell } from "@/components/partner/PartnerShell";

export const dynamic = "force-dynamic";

export default async function PartnerGatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  if (
    session.profile.role !== "restaurant_owner" &&
    session.profile.role !== "admin"
  ) {
    redirect("/partner/sign-in");
  }

  const supabase = await createSupabaseServerClient();
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name")
    .eq("owner_user_id", session.userId)
    .maybeSingle();

  return (
    <PartnerShell
      restaurantName={restaurant?.name ?? null}
      userEmail={session.userEmail}
    >
      {children}
    </PartnerShell>
  );
}
