"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageSquare, Phone, type LucideIcon } from "lucide-react";
import { toast } from "@/components/toast";
import { useT } from "@/lib/i18n/messages-provider";
import { setCampaignStatusAction, sendCampaignAction } from "../actions";
import { NewCampaignForm } from "./NewCampaignForm";

interface Campaign {
  id: string;
  kind: "triggered" | "one_off";
  triggeredCampaignKey: string | null;
  name: string;
  status: string;
  channel: string;
  sentAt: string | null;
  scheduledSendAt: string | null;
  recipientCountEstimate: number | null;
}

const CHANNEL_ICON: Record<string, LucideIcon> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: Phone,
  in_confirmation: Mail,
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-surface-bg text-text-secondary",
  scheduled: "bg-info/10 text-info",
  sending: "bg-amber-50 text-amber-700",
  sent: "bg-emerald-50 text-emerald-700",
  active: "bg-brand-primary-soft text-brand-primary-dark",
  paused: "bg-surface-bg text-text-muted",
  archived: "bg-surface-bg text-text-muted",
  cancelled: "bg-surface-bg text-text-muted",
};

function ChannelChip({ channel }: { channel: string }) {
  const Icon = CHANNEL_ICON[channel] ?? Mail;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary-soft text-brand-primary">
      <Icon size={16} aria-hidden />
    </span>
  );
}

export function MarketingManager({
  organizationId,
  campaigns,
  locale,
}: {
  organizationId: string;
  campaigns: Campaign[];
  locale: string;
}) {
  const t = useT("partner.marketing");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  const triggered = campaigns.filter((c) => c.kind === "triggered");
  const oneOff = campaigns.filter((c) => c.kind === "one_off");

  // Pin the timezone (RO market) so the SSR pass and the client agree on the
  // calendar day — an unpinned formatter uses the runtime zone (server UTC vs
  // browser local), which flips dates near midnight and trips hydration.
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Bucharest",
  });
  const fmtDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : null);

  const triggeredLabel = (key: string | null, fallback: string) => {
    if (!key) return fallback;
    const label = t(`triggeredLabels.${key}`);
    return label === `triggeredLabels.${key}` ? fallback : label;
  };
  const channelLabel = (channel: string) => {
    const label = t(`channels.${channel}`);
    return label === `channels.${channel}` ? channel : label;
  };
  const statusLabel = (status: string) => {
    const label = t(`manager.status.${status}`);
    return label === `manager.status.${status}` ? status : label;
  };

  function run(fn: () => Promise<{ ok: boolean }>, successMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(successMsg);
        router.refresh();
      } else {
        toast.error(t("manager.actionFailed"));
      }
    });
  }

  return (
    <div className="space-y-12">
      {/* Triggered campaigns */}
      <section>
        <h2 className="font-display text-xl text-text-primary">{t("manager.triggeredTitle")}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t("manager.triggeredSubtitle")}</p>

        {triggered.length === 0 ? (
          <p className="mt-4 rounded-card border border-dashed border-border bg-surface-bg/50 px-5 py-8 text-center text-sm text-text-muted">
            {t("manager.triggeredEmpty")}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {triggered.map((c) => {
              const enabled = c.status === "active";
              const label = triggeredLabel(c.triggeredCampaignKey, c.name);
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-4 rounded-card border border-border bg-surface-white px-5 py-4 transition-shadow hover:shadow-card-hover"
                >
                  <ChannelChip channel={c.channel} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text-primary">{label}</p>
                    <p className="text-xs text-text-secondary">{channelLabel(c.channel)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => setCampaignStatusAction(organizationId, c.id, enabled ? "paused" : "active"),
                        enabled ? t("manager.campaignStopped") : t("manager.campaignStarted"),
                      )
                    }
                    aria-pressed={enabled}
                    aria-label={t("manager.toggleAriaLabel", {
                      action: enabled ? t("manager.toggleOff") : t("manager.toggleOn"),
                      name: label,
                    })}
                    className={[
                      "relative h-7 w-12 shrink-0 rounded-pill transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:opacity-60",
                      enabled ? "bg-brand-primary" : "bg-border",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                        enabled ? "left-6" : "left-1",
                      ].join(" ")}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* One-off campaigns */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-text-primary">{t("manager.oneOffTitle")}</h2>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="text-sm font-semibold text-brand-primary-dark hover:underline"
          >
            {showForm ? t("manager.cancel") : t("manager.newCampaign")}
          </button>
        </div>

        {showForm && (
          <NewCampaignForm organizationId={organizationId} onCreated={() => setShowForm(false)} />
        )}

        {oneOff.length === 0 ? (
          <p className="mt-4 rounded-card border border-dashed border-border bg-surface-bg/50 px-5 py-8 text-center text-sm text-text-muted">
            {t("manager.oneOffEmpty")}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {oneOff.map((c) => {
              const date =
                c.status === "scheduled"
                  ? fmtDate(c.scheduledSendAt)
                  : fmtDate(c.sentAt);
              const dateLabel = date
                ? c.status === "scheduled"
                  ? t("manager.scheduledFor", { date })
                  : t("manager.sentOn", { date })
                : null;
              const meta = [
                channelLabel(c.channel),
                c.recipientCountEstimate != null
                  ? t("manager.recipients", { count: c.recipientCountEstimate })
                  : null,
                dateLabel,
              ].filter(Boolean);

              return (
                <li
                  key={c.id}
                  className="flex items-center gap-4 rounded-card border border-border bg-surface-white px-5 py-4 transition-shadow hover:shadow-card-hover"
                >
                  <ChannelChip channel={c.channel} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-text-primary">{c.name}</p>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold ${
                          STATUS_TONE[c.status] ?? STATUS_TONE.draft
                        }`}
                      >
                        {statusLabel(c.status)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-secondary">{meta.join(" · ")}</p>
                  </div>

                  {c.status === "draft" && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => sendCampaignAction(organizationId, c.id), t("manager.sent"))}
                        className="min-h-[36px] rounded-button bg-brand-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-primary-dark disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                      >
                        {t("manager.send")}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => setCampaignStatusAction(organizationId, c.id, "archived"), t("manager.archived"))}
                        className="min-h-[36px] rounded-button px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-error disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
                      >
                        {t("manager.archive")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
