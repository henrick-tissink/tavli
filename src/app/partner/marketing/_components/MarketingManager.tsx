"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
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

const TRIGGERED_LABELS: Record<string, string> = {
  post_visit_review: "Mulțumire post-vizită + recenzie",
  pre_arrival: "Memento înainte de sosire",
  birthday_anniversary: "Zi de naștere / aniversare",
  lapsed_60: "Reactivare oaspeți pierduți (60 zile)",
  lapsed_120: "Reactivare oaspeți pierduți (120 zile)",
  lapsed_180: "Reactivare oaspeți pierduți (180 zile)",
  no_show_followup: "Follow-up no-show",
  welcome_series: "Serie de bun-venit",
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  in_confirmation: "În confirmare",
};

export function MarketingManager({
  organizationId,
  campaigns,
}: {
  organizationId: string;
  campaigns: Campaign[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  const triggered = campaigns.filter((c) => c.kind === "triggered");
  const oneOff = campaigns.filter((c) => c.kind === "one_off");

  function run(fn: () => Promise<{ ok: boolean }>, successMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(successMsg);
        router.refresh();
      } else {
        toast.error("Acțiunea nu a reușit.");
      }
    });
  }


  return (
    <div className="space-y-12">
      {/* Triggered campaigns */}
      <section>
        <h2 className="font-display text-xl text-text-primary">Campanii automate</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Configurează o dată, rulează la nesfârșit. Pornește sau oprește fiecare.
        </p>
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-white">
          {triggered.map((c) => {
            const enabled = c.status === "active";
            const label = TRIGGERED_LABELS[c.triggeredCampaignKey ?? ""] ?? c.name;
            return (
              <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-text-primary">{label}</p>
                  <p className="text-xs text-text-secondary">{CHANNEL_LABEL[c.channel] ?? c.channel}</p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => setCampaignStatusAction(organizationId, c.id, enabled ? "paused" : "active"),
                      enabled ? "Campanie oprită." : "Campanie pornită.",
                    )
                  }
                  aria-pressed={enabled}
                  aria-label={`${enabled ? "Oprește" : "Pornește"} campania: ${label}`}
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
              Nicio campanie automată configurată încă.
            </li>
          )}
        </ul>
      </section>

      {/* One-off campaigns */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-text-primary">Campanii punctuale</h2>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="text-sm font-semibold text-brand-primary-dark hover:underline"
          >
            {showForm ? "Anulează" : "+ Campanie nouă"}
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
                  {CHANNEL_LABEL[c.channel] ?? c.channel} ·{" "}
                  <span className="capitalize">{c.status}</span>
                </p>
              </div>
              {c.status === "draft" && (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => sendCampaignAction(organizationId, c.id), "Campanie trimisă spre livrare.")}
                    className="min-h-[36px] rounded-button bg-brand-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-primary-dark disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                  >
                    Trimite
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setCampaignStatusAction(organizationId, c.id, "archived"), "Campanie arhivată.")}
                    className="min-h-[36px] rounded-button px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-error disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
                  >
                    Arhivează
                  </button>
                </div>
              )}
            </li>
          ))}
          {oneOff.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-text-muted">Nicio campanie punctuală încă.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
