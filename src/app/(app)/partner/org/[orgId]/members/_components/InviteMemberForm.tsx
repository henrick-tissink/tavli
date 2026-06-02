"use client";

import { useActionState } from "react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import { inviteOrgMemberAction, type InviteResult } from "../actions";

/** `roles` are the org-level roles the lib accepts (owner is excluded — there
 * is one owner per org and it isn't assignable via invitation). */
const ROLE_VALUES = ["admin", "manager"] as const;

export function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const t = useT("partner.org");
  const [state, action, pending] = useActionState<InviteResult | undefined, FormData>(
    inviteOrgMemberAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-text-secondary">{t("inviteForm.emailLabel")}</span>
          <input
            type="email"
            name="email"
            required
            placeholder={t("inviteForm.emailPlaceholder")}
            className="w-full rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none"
          />
        </label>
        <label className="sm:w-56">
          <span className="mb-1 block text-xs font-medium text-text-secondary">{t("inviteForm.roleLabel")}</span>
          <select
            name="role"
            defaultValue="manager"
            className="w-full rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none"
          >
            {ROLE_VALUES.map((value) => (
              <option key={value} value={value}>
                {value === "admin" ? t("inviteForm.roleAdmin") : t("inviteForm.roleManager")}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? t("inviteForm.submitting") : t("inviteForm.submit")}
        </Button>
      </div>
      {state?.ok && (
        <p className="text-sm text-emerald-700" role="status">
          {t("inviteForm.success")}
        </p>
      )}
      {state && !state.ok && (
        <p className="text-sm text-red-700" role="alert">
          {t(`inviteForm.errors.${state.error ?? ""}`) === `inviteForm.errors.${state.error ?? ""}`
            ? t("inviteForm.errors.generic")
            : t(`inviteForm.errors.${state.error ?? ""}`)}
        </p>
      )}
    </form>
  );
}
