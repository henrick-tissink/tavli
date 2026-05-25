"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { acceptStaffInvitationAction } from "./actions";

const ERRORS: Record<string, string> = {
  auth_required: "Trebuie să fii conectat pentru a accepta invitația.",
  not_found: "Invitația nu a fost găsită.",
  invalid_input: "Invitația a expirat sau nu mai este validă.",
  forbidden: "Adresa de email a contului tău nu se potrivește cu invitația.",
  already_member: "Faci deja parte din această echipă.",
};

export function AcceptStaffForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-6">
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {ERRORS[error] ?? "A apărut o eroare. Încearcă din nou."}
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
        {pending ? "Se acceptă…" : "Acceptă invitația"}
      </Button>
    </div>
  );
}
