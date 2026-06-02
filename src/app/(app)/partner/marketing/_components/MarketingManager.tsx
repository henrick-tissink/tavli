"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
}

export function MarketingManager({
  organizationId,
  campaigns,
}: {
  organizationId: string;
  campaigns: Campaign[];
}) {
  const t = useT("partner.marketing");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  const triggered = campaigns.filter((c) => c.kind === "triggered");
  const oneOff = campaigns.filter((c) => c.kind === "one_off");

  const triggeredLabel = (key: string | null, fallback: string) =>
    key ? t(`triggeredLabels.${key}`) : fallback;
  const channelLabel = (channel: string) => {
    const label = t(`channels.${channel}`);
    return label === `channels.${channel}` ? channel : label;
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
        <p className="mt-1 text-sm text-text-secondary">
          {t("manager.triggeredSubtitle")}
        </p>
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-white">
          {triggered.map((c) => {
            const enabled = c.status === "active";
            const label = triggeredLabel(c.triggeredCampaignKey, c.name);
            return (
              <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-text-primary">{label}</p>
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
                    "relative h-7 w-12 shrink-0 rounded-pill transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
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
          {triggered.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-text-muted">
              {t("manager.triggeredEmpty")}
            </li>
          )}
        </ul>
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

        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-white">
          {oneOff.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium text-text-primary">{c.name}</p>
                <p className="text-xs text-text-secondary">
                  {channelLabel(c.channel)} ·{" "}
                  <span className="capitalize">{c.status}</span>
                </p>
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
          ))}
          {oneOff.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-text-muted">{t("manager.oneOffEmpty")}</li>
          )}
        </ul>
      </section>
    </div>
  );
}
