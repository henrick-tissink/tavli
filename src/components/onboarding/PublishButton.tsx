"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import {
  publishRestaurant,
  type PublishResult,
} from "@/app/(app)/onboard/[token]/review/actions";

export function PublishButton() {
  const [state, action, pending] = useActionState<
    PublishResult | undefined,
    FormData
  >(async (prev) => {
    const result = await publishRestaurant(prev);
    return result ?? { ok: true };
  }, undefined);

  return (
    <form action={action}>
      {state?.error && (
        <p className="text-sm text-error mb-3" role="alert">
          {state.error}
        </p>
      )}
      <Button fullWidth type="submit" disabled={pending}>
        {pending ? "Se publică…" : "Publică și pornește"}
      </Button>
    </form>
  );
}
