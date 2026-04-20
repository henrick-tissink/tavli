import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { DEFAULT_HOURS, type DayHours } from "@/lib/onboarding";
import { PartnerHoursForm } from "@/components/partner/PartnerHoursForm";

export const dynamic = "force-dynamic";

export default async function PartnerHoursPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();

  const { data: draft } = await supabase
    .from("draft_restaurants")
    .select("payload")
    .eq("owner_user_id", session!.userId)
    .maybeSingle();

  const payloadHours =
    (draft?.payload as { hours?: DayHours[] } | null)?.hours ?? null;
  const initialHours =
    payloadHours && payloadHours.length === 7 ? payloadHours : DEFAULT_HOURS;

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Hours
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Your weekly opening times. Special-date exceptions land in a later
          milestone.
        </p>
      </header>

      <PartnerHoursForm initialHours={initialHours} />
    </div>
  );
}
