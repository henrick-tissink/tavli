"use client";

import { useTransition } from "react";
import { resendInvitation, revokeInvitation } from "@/app/(app)/admin/(gated)/invitations/actions";
import { toast } from "@/components/toast";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { BCP47 } from "@/lib/i18n/locale";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800",
  claimed: "bg-emerald-50 text-emerald-800",
  expired: "bg-surface-bg text-text-muted",
  revoked: "bg-red-50 text-red-800",
};

export interface InvitationRowProps {
  id: string;
  email: string;
  cityName: string | null;
  proposedName: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export function InvitationRow(invitation: InvitationRowProps) {
  const t = useT("admin.invitations");
  const locale = useLocale();
  const [pending, start] = useTransition();

  const expires = new Date(invitation.expiresAt);
  const expired = expires < new Date();
  const displayStatus = expired && invitation.status === "pending" ? "expired" : invitation.status;

  const handleResend = () => {
    start(async () => {
      const result = await resendInvitation(invitation.id);
      if (!result.ok) {
        toast.error(t("row.toastResendFailed", { error: result.error ?? "" }));
      } else if (result.devMode && result.url) {
        try {
          await navigator.clipboard.writeText(result.url);
          toast.success(t("row.toastDevLinkCopied"));
        } catch {
          toast.success(t("row.toastDevLink", { url: result.url }));
        }
      } else {
        toast.success(t("row.toastResent"));
      }
    });
  };

  const handleRevoke = () => {
    if (!confirm(t("row.revokeConfirm", { email: invitation.email }))) return;
    start(async () => {
      await revokeInvitation(invitation.id);
      toast.success(t("row.toastRevoked"));
    });
  };

  return (
    <tr className="hover:bg-surface-bg/50 transition-colors">
      <td className="px-4 py-3">
        <p className="font-semibold text-text-primary">{invitation.email}</p>
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {invitation.proposedName ?? t("row.empty")}
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {invitation.cityName ?? t("row.empty")}
      </td>
      <td className="px-4 py-3">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
            STATUS_STYLES[displayStatus] ?? ""
          }`}
        >
          {t(`status.${displayStatus}`)}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-text-muted">
        {expires.toLocaleDateString(BCP47[locale], { day: "numeric", month: "short" })}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {invitation.status === "pending" && !expired && (
          <>
            <button
              type="button"
              onClick={handleResend}
              disabled={pending}
              className="text-brand-primary text-xs font-semibold hover:underline mr-3"
            >
              {t("row.resend")}
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={pending}
              className="text-error text-xs font-semibold hover:underline"
            >
              {t("row.revoke")}
            </button>
          </>
        )}
        {(displayStatus === "expired" || invitation.status === "revoked") && (
          <button
            type="button"
            onClick={handleResend}
            disabled={pending}
            className="text-brand-primary text-xs font-semibold hover:underline"
          >
            {t("row.reissue")}
          </button>
        )}
        {invitation.status === "claimed" && (
          <span className="text-xs text-text-muted">{t("row.accepted")}</span>
        )}
      </td>
    </tr>
  );
}
