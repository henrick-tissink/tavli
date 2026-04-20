"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/button";
import { HoursEditor } from "@/components/onboarding/HoursEditor";
import {
  savePartnerHours,
  type SaveHoursResult,
} from "@/app/partner/(dashboard)/hours/actions";
import type { DayHours } from "@/lib/onboarding";

export function PartnerHoursForm({ initialHours }: { initialHours: DayHours[] }) {
  const [state, action, pending] = useActionState<
    SaveHoursResult | undefined,
    FormData
  >(savePartnerHours, undefined);
  const [hours, setHours] = useState<DayHours[]>(initialHours);

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <HoursEditor value={hours} onChange={setHours} />

      {state?.error && <p className="text-sm text-error" role="alert">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">Saved.</p>}

      <div className="pt-2">
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save hours"}
        </Button>
      </div>
    </form>
  );
}
