import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { DEFAULT_HOURS, type DayHours } from "@/lib/onboarding";
import { PartnerHoursForm } from "@/components/partner/PartnerHoursForm";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function PartnerHoursPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();
  const m = getMessages(await resolveAppLocale(), "partner.settings").hours;

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
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          {m.title}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {m.subtitle}
        </p>
      </header>

      <PartnerHoursForm initialHours={initialHours} />
    </div>
  );
}
