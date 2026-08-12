"use client";

import { useState, useTransition } from "react";
import { resendInvitation, revokeInvitation } from "@/app/(app)/admin/(gated)/invitations/actions";
import { Spinner } from "@/components/spinner";
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
  /**
   * Which of the row's actions is running. The transition exposes one flag for
   * the whole row, so keying off it alone greyed Resend, Revoke and Reissue
   * together and left the clicked one indistinguishable from its neighbours.
   * (Resend and Reissue are the same call in mutually exclusive branches, so
   * they share a key.)
   */
  const [runningAction, setRunningAction] = useState<"resend" | "revoke" | null>(null);
  const isRunning = (action: "resend" | "revoke") =>
    pending && runningAction === action;

  const expires = new Date(invitation.expiresAt);
  const expired = expires < new Date();
  const displayStatus = expired && invitation.status === "pending" ? "expired" : invitation.status;

  const handleResend = () => {
    if (runningAction) return;
    setRunningAction("resend");
    start(async () => {
      try {
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
      } finally {
        setRunningAction(null);
      }
    });
  };

  const handleRevoke = () => {
    if (runningAction) return;
    if (!confirm(t("row.revokeConfirm", { email: invitation.email }))) return;
    setRunningAction("revoke");
    start(async () => {
      try {
        await revokeInvitation(invitation.id);
        toast.success(t("row.toastRevoked"));
      } finally {
        setRunningAction(null);
      }
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
              disabled={isRunning("resend")}
              aria-busy={isRunning("resend") || undefined}
              className="inline-flex items-center gap-1 text-brand-primary text-xs font-semibold hover:underline mr-3 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRunning("resend") && <Spinner size={12} />}
              {t("row.resend")}
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={isRunning("revoke")}
              aria-busy={isRunning("revoke") || undefined}
              className="inline-flex items-center gap-1 text-error text-xs font-semibold hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRunning("revoke") && <Spinner size={12} />}
              {t("row.revoke")}
            </button>
          </>
        )}
        {(displayStatus === "expired" || invitation.status === "revoked") && (
          <button
            type="button"
            onClick={handleResend}
            disabled={isRunning("resend")}
            aria-busy={isRunning("resend") || undefined}
            className="inline-flex items-center gap-1 text-brand-primary text-xs font-semibold hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRunning("resend") && <Spinner size={12} />}
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
