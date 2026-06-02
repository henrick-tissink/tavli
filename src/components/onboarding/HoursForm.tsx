"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/button";
import { HoursEditor } from "./HoursEditor";
import { useT } from "@/lib/i18n/messages-provider";
import {
  saveHours,
  type SaveHoursResult,
} from "@/app/(app)/onboard/[token]/hours/actions";
import type { DayHours } from "@/lib/onboarding";

interface Props {
  token: string;
  initialHours: DayHours[];
}

export function HoursForm({ token, initialHours }: Props) {
  const t = useT("partner.onboarding");
  const action = saveHours.bind(null, token);
  const [state, dispatch, pending] = useActionState<
    SaveHoursResult | undefined,
    FormData
  >(action, undefined);
  const [hours, setHours] = useState<DayHours[]>(initialHours);

  return (
    <form action={dispatch} className="space-y-6">
      <HoursEditor value={hours} onChange={setHours} />

      {state?.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <div className="pt-2 flex items-center justify-between gap-3">
        <a
          href={`/onboard/${token}/profile`}
          className="text-sm font-semibold text-text-secondary hover:underline"
        >
          {t("wizard.hours.back")}
        </a>
        <Button disabled={pending} type="submit">
          {pending ? t("wizard.hours.submitPending") : t("wizard.hours.submit")}
        </Button>
      </div>
    </form>
  );
}
