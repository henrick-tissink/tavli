"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import { inviteVenueStaffAction, type InviteResult } from "../actions";

export function InviteStaffForm({
  restaurantId,
  organizationId,
}: {
  restaurantId: string;
  organizationId: string;
}) {
  const t = useT("partner.staffSecurity");
  const [state, action, pending] = useActionState<InviteResult | undefined, FormData>(
    inviteVenueStaffAction,
    undefined,
  );

  const KNOWN_ERRORS = new Set(["auth_required", "forbidden", "invalid_input"]);
  const errorMessage =
    state && !state.ok && state.error && KNOWN_ERRORS.has(state.error)
      ? t(`staff.invite.errors.${state.error}`)
      : t("staff.invite.errors.generic");

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-text-secondary">{t("staff.invite.emailLabel")}</span>
          <input
            type="email"
            name="email"
            required
            placeholder={t("staff.invite.emailPlaceholder")}
            className="w-full rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none"
          />
        </label>
        <label className="sm:w-56">
          <span className="mb-1 block text-xs font-medium text-text-secondary">{t("staff.invite.roleLabel")}</span>
          <select
            name="role"
            defaultValue="host"
            className="w-full rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none"
          >
            <option value="manager">{t("staff.invite.roleManager")}</option>
            <option value="host">{t("staff.invite.roleHost")}</option>
          </select>
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? t("staff.invite.submitting") : t("staff.invite.submit")}
        </Button>
      </div>
      {state?.ok && (
        <p className="text-sm text-emerald-700" role="status">
          {t("staff.invite.success")}
        </p>
      )}
      {state && !state.ok && (
        <p className="text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
