"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/button";
import { HoursEditor } from "./HoursEditor";
import {
  saveHours,
  type SaveHoursResult,
} from "@/app/onboard/[token]/hours/actions";
import type { DayHours } from "@/lib/onboarding";

interface Props {
  token: string;
  initialHours: DayHours[];
}

export function HoursForm({ token, initialHours }: Props) {
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
          ← Back
        </a>
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save & continue"}
        </Button>
      </div>
    </form>
  );
}
