"use client";

import { useTransition, useState } from "react";
import { resendInvitation, revokeInvitation } from "@/app/admin/(gated)/invitations/actions";

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
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const expires = new Date(invitation.expiresAt);
  const expired = expires < new Date();
  const displayStatus = expired && invitation.status === "pending" ? "expired" : invitation.status;

  const handleResend = () => {
    start(async () => {
      const result = await resendInvitation(invitation.id);
      if (!result.ok) {
        setNotice(`Failed: ${result.error}`);
      } else if (result.devMode && result.url) {
        try {
          await navigator.clipboard.writeText(result.url);
          setNotice("New link copied (dev mode — email not sent).");
        } catch {
          setNotice(`Dev mode link: ${result.url}`);
        }
      } else {
        setNotice("New email sent.");
      }
      window.setTimeout(() => setNotice(null), 4000);
    });
  };

  const handleRevoke = () => {
    if (!confirm(`Revoke invitation to ${invitation.email}?`)) return;
    start(async () => {
      await revokeInvitation(invitation.id);
    });
  };

  return (
    <tr className="hover:bg-surface-bg/50 transition-colors">
      <td className="px-4 py-3">
        <p className="font-semibold text-text-primary">{invitation.email}</p>
        {notice && (
          <p className="text-xs text-brand-primary mt-0.5">{notice}</p>
        )}
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {invitation.proposedName ?? "—"}
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {invitation.cityName ?? "—"}
      </td>
      <td className="px-4 py-3">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
            STATUS_STYLES[displayStatus] ?? ""
          }`}
        >
          {displayStatus}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-text-muted">
        {expires.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
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
              Resend
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={pending}
              className="text-error text-xs font-semibold hover:underline"
            >
              Revoke
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
            Reissue
          </button>
        )}
        {invitation.status === "claimed" && (
          <span className="text-xs text-text-muted">Accepted</span>
        )}
      </td>
    </tr>
  );
}
