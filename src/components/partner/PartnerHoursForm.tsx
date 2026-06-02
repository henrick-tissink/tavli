"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/button";
import { HoursEditor } from "@/components/onboarding/HoursEditor";
import { toast } from "@/components/toast";
import { useT } from "@/lib/i18n/messages-provider";
import {
  savePartnerHours,
  type SaveHoursResult,
} from "@/app/(app)/partner/(dashboard)/hours/actions";
import type { DayHours } from "@/lib/onboarding";

export function PartnerHoursForm({ initialHours }: { initialHours: DayHours[] }) {
  const t = useT("partner.settings");
  const [state, action, pending] = useActionState<
    SaveHoursResult | undefined,
    FormData
  >(savePartnerHours, undefined);
  const [hours, setHours] = useState<DayHours[]>(initialHours);

  useEffect(() => {
    if (state?.ok) toast.success(t("hours.toastSaved"));
  }, [state, t]);

  const errorText = state?.error
    ? state.error === "billing_locked"
      ? t("hours.errors.billing_locked")
      : state.error
    : null;

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <HoursEditor value={hours} onChange={setHours} />

      {errorText && <p className="text-sm text-error" role="alert">{errorText}</p>}

      <div className="pt-2">
        <Button disabled={pending} type="submit">
          {pending ? t("hours.saving") : t("hours.save")}
        </Button>
      </div>
    </form>
  );
}
