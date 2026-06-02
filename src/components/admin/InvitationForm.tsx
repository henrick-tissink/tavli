"use client";

import { useActionState, useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/button";
import { toast } from "@/components/toast";
import { useT } from "@/lib/i18n/messages-provider";
import {
  createInvitation,
  type CreateInvitationResult,
} from "@/app/(app)/admin/(gated)/invitations/actions";

interface City {
  id: string;
  name: string;
}

export function InvitationForm({ cities }: { cities: City[] }) {
  const t = useT("admin.invitations");
  const [state, action, pending] = useActionState<
    CreateInvitationResult | undefined,
    FormData
  >(createInvitation, undefined);

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state?.ok && !state.devMode) {
      toast.success(t("form.toastSent"));
    }
  }, [state, t]);

  const handleCopy = () => {
    if (!state?.invitationUrl) return;
    navigator.clipboard.writeText(state.invitationUrl);
    setCopied(true);
    toast.success(t("form.toastCopied"));
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-surface-white rounded-card border border-border p-6 space-y-4 max-w-xl">
      <form action={action} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="email">
            {t("form.emailLabel")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder={t("form.emailPlaceholder")}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="cityId">
            {t("form.cityLabel")}
          </label>
          <select
            id="cityId"
            name="cityId"
            required
            defaultValue=""
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary bg-surface-white"
          >
            <option value="" disabled>
              {t("form.cityPlaceholder")}
            </option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="proposedName">
            {t("form.nameLabel")} <span className="text-text-muted font-normal">{t("form.nameOptional")}</span>
          </label>
          <input
            id="proposedName"
            name="proposedName"
            type="text"
            placeholder={t("form.namePlaceholder")}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-error" role="alert">
            {state.error}
          </p>
        )}

        <Button disabled={pending} type="submit">
          {pending ? t("form.submitPending") : t("form.submit")}
        </Button>
      </form>

      {state?.ok && state.invitationUrl && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            state.devMode
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          <p className="font-semibold mb-1">
            {state.devMode
              ? t("form.devModeTitle")
              : t("form.sentTitle")}
          </p>
          <p className="text-xs mb-2 opacity-80">
            {state.devMode
              ? t("form.devModeHint")
              : t("form.sentHint")}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-surface-white px-2 py-1 rounded text-xs font-mono truncate">
              {state.invitationUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={t("form.copyAriaLabel")}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-white border border-border text-xs font-semibold hover:bg-surface-bg"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t("form.copied") : t("form.copy")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
