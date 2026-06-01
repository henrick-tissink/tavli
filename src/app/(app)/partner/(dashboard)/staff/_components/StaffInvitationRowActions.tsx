"use client";

import { useState, useTransition } from "react";
import { revokeVenueInvitationAction, resendVenueInvitationAction } from "../actions";

export function StaffInvitationRowActions({ invitationId }: { invitationId: string }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {note && <span className="text-xs text-text-muted">{note}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setNote(null);
            const res = await resendVenueInvitationAction(invitationId);
            setNote(res.ok ? "Retrimisă" : "Eroare");
          })
        }
        className="text-xs font-semibold text-brand-primary hover:underline disabled:opacity-50"
      >
        Retrimite
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setNote(null);
            await revokeVenueInvitationAction(invitationId);
          })
        }
        className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
      >
        Anulează
      </button>
    </div>
  );
}
