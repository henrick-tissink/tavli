import { redirect } from "next/navigation";
import { Button } from "@/components/button";
import { createSupabaseServerClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export default async function PartnerLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ justPublished?: string }>;
}) {
  const { justPublished } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/partner/sign-in");

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name, status")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center px-4">
      <div className="max-w-xl w-full bg-surface-white rounded-card border border-border p-8 shadow-card text-center">
        <p className="font-display text-2xl font-bold text-brand-primary tracking-tight">
          Tavli
        </p>
        <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
          Partner
        </p>

        {justPublished === "1" && (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 p-4 text-left">
            <p className="font-semibold">🎉 You&apos;re live on Tavli.</p>
            <p className="text-sm mt-1">
              {restaurant?.name ? `${restaurant.name} is ` : "Your restaurant is "}
              discoverable in the consumer feed right now. The full partner
              dashboard arrives in M8.
            </p>
          </div>
        )}

        <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight mt-6">
          Welcome, {restaurant?.name ?? "partner"}.
        </h1>
        <p className="text-sm text-text-secondary mt-3 leading-relaxed">
          The partner dashboard (profile/hours/photos/menu editors +
          reservations) is being built in milestones M8–M13. For now, admins
          can manage content on your behalf — or you can edit directly in
          Supabase Studio.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <form
            action={async () => {
              "use server";
              const supabase = await createSupabaseServerClient();
              await supabase.auth.signOut();
              redirect("/partner/sign-in");
            }}
          >
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>

        <p className="text-xs text-text-muted mt-6">
          Current status: <strong>{restaurant?.status ?? "unknown"}</strong>
        </p>
      </div>
    </div>
  );
}
