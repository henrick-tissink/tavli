"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/button";
import { HoursEditor } from "@/components/onboarding/HoursEditor";
import { toast } from "@/components/toast";
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

  useEffect(() => {
    if (state?.ok) toast.success("Hours saved.");
  }, [state]);

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <HoursEditor value={hours} onChange={setHours} />

      {state?.error && <p className="text-sm text-error" role="alert">{state.error}</p>}

      <div className="pt-2">
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save hours"}
        </Button>
      </div>
    </form>
  );
}
