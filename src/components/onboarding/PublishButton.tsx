"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import {
  publishRestaurant,
  type PublishResult,
} from "@/app/(app)/onboard/[token]/review/actions";

export function PublishButton() {
  const t = useT("partner.onboarding");
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
        {pending ? t("wizard.publish.submitPending") : t("wizard.publish.submit")}
      </Button>
    </form>
  );
}
