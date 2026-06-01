"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { inviteVenueStaffAction, type InviteResult } from "../actions";

const ERRORS: Record<string, string> = {
  auth_required: "Trebuie să fii conectat.",
  forbidden: "Nu ai permisiunea de a invita personal.",
  invalid_input: "Verifică adresa de email și rolul.",
};

export function InviteStaffForm({
  restaurantId,
  organizationId,
}: {
  restaurantId: string;
  organizationId: string;
}) {
  const [state, action, pending] = useActionState<InviteResult | undefined, FormData>(
    inviteVenueStaffAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-text-secondary">Email</span>
          <input
            type="email"
            name="email"
            required
            placeholder="coleg@exemplu.ro"
            className="w-full rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none"
          />
        </label>
        <label className="sm:w-56">
          <span className="mb-1 block text-xs font-medium text-text-secondary">Rol</span>
          <select
            name="role"
            defaultValue="host"
            className="w-full rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none"
          >
            <option value="manager">Manager — gestionează rezervări și setări</option>
            <option value="host">Gazdă — gestionează rezervările zilnice</option>
          </select>
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Se trimite…" : "Trimite invitația"}
        </Button>
      </div>
      {state?.ok && (
        <p className="text-sm text-emerald-700" role="status">
          Invitația a fost trimisă.
        </p>
      )}
      {state && !state.ok && (
        <p className="text-sm text-red-700" role="alert">
          {ERRORS[state.error ?? ""] ?? "Nu am putut trimite invitația."}
        </p>
      )}
    </form>
  );
}
