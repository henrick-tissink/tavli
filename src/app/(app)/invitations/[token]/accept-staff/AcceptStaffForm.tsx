"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { type PartnerStaffSecurityMessages } from "@/lib/i18n/messages";
import { acceptStaffInvitationAction } from "./actions";

type AcceptMessages = PartnerStaffSecurityMessages["staff"]["acceptInvitation"];

export function AcceptStaffForm({
  token,
  msgs,
}: {
  token: string;
  msgs: AcceptMessages;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const errorText = (code: string): string =>
    (msgs.errors as Record<string, string | undefined>)[code] ??
    msgs.errors.generic;

  return (
    <div className="mt-6">
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {errorText(error)}
        </p>
      )}
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await acceptStaffInvitationAction(token);
            // A successful accept redirects server-side; we only reach here on error.
            if (res && !res.ok) setError(res.error ?? "unknown");
          })
        }
      >
        {pending ? msgs.pending : msgs.submit}
      </Button>
    </div>
  );
}
