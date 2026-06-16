"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";

interface CapState {
  enabled: boolean;
  openCount?: number;
}
type CapKey = "events" | "corporateMeals" | "standing" | "meetingNooks";

interface Props {
  restaurantId: string;
  capabilities: Record<CapKey, CapState>;
  onToggle: (cap: CapKey, next: boolean) => Promise<void>;
}

const CARDS: Array<{ key: CapKey; phase1: boolean }> = [
  { key: "events", phase1: true },
  { key: "corporateMeals", phase1: true },
  { key: "standing", phase1: true },
  { key: "meetingNooks", phase1: true },
];

export function CorporateOverview({ capabilities, onToggle }: Props) {
  const t = useT("partner.corporate");
  const [busy, setBusy] = useState<CapKey | null>(null);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {CARDS.map((c) => {
        const state = capabilities[c.key];
        const title = t(`overview.cards.${c.key}.title`);
        const isEvents = c.key === "events";
        return (
          <div key={c.key} className="flex flex-col rounded-card border border-border bg-surface-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-text-primary">{title}</p>
                <p className="mt-1 text-sm text-text-secondary">
                  {t(`overview.cards.${c.key}.blurb`)}
                </p>
              </div>
              {c.phase1 ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={state.enabled}
                  aria-label={title}
                  disabled={busy === c.key}
                  onClick={async () => {
                    setBusy(c.key);
                    try {
                      await onToggle(c.key, !state.enabled);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className={`relative h-[26px] w-11 flex-none rounded-full transition-colors disabled:opacity-60 ${
                    state.enabled ? "bg-brand-primary" : "bg-stone-300"
                  }`}
                >
                  <span
                    className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all"
                    style={{ left: state.enabled ? 21 : 3 }}
                  />
                </button>
              ) : (
                <span className="flex-none rounded-pill bg-surface-bg px-2.5 py-1 text-xs font-semibold text-text-muted">
                  {t("overview.comingSoon")}
                </span>
              )}
            </div>

            {isEvents && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-xs font-semibold text-text-muted">
                  {state.enabled ? t("overview.enabledHint") : t("overview.disabledHint")}
                  {state.openCount !== undefined && state.openCount > 0 && (
                    <>
                      {" · "}
                      <span className="text-brand-primary">
                        {t("overview.openRequests", { count: state.openCount })}
                      </span>
                    </>
                  )}
                </span>
                <Link
                  href="/partner/corporate/events"
                  className="inline-flex flex-none items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
                >
                  {t("overview.manageRequests")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
            {c.key === "meetingNooks" && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-xs font-semibold text-text-muted">
                  {state.enabled ? t("overview.enabledHint") : t("overview.disabledHint")}
                  {state.openCount !== undefined && state.openCount > 0 && (
                    <>
                      {" · "}
                      <span className="text-brand-primary">
                        {t("overview.openMeetingRequests", { count: state.openCount })}
                      </span>
                    </>
                  )}
                </span>
                <span className="flex flex-none items-center gap-3">
                  <Link
                    href="/partner/corporate/meeting-spaces"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
                  >
                    {t("overview.manageMeetingSpaces")}
                  </Link>
                  <Link
                    href="/partner/corporate/meeting-bookings"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
                  >
                    {t("overview.meetingRequests")} <ArrowRight className="h-4 w-4" />
                  </Link>
                </span>
              </div>
            )}
            {c.key === "corporateMeals" && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-xs font-semibold text-text-muted">
                  {state.enabled ? t("overview.enabledHint") : t("overview.disabledHint")}
                  {state.openCount !== undefined && state.openCount > 0 && (
                    <>
                      {" · "}
                      <span className="text-brand-primary">
                        {t("overview.corporateClientsCount", { count: state.openCount })}
                      </span>
                    </>
                  )}
                </span>
                <Link
                  href="/partner/corporate/companies"
                  className="inline-flex flex-none items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
                >
                  {t("overview.manageCompanies")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
            {c.key === "standing" && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-xs font-semibold text-text-muted">
                  {state.enabled ? t("overview.enabledHint") : t("overview.disabledHint")}
                  {state.openCount !== undefined && state.openCount > 0 && (
                    <>{" · "}<span className="text-brand-primary">{t("overview.activeStandingCount", { count: state.openCount })}</span></>
                  )}
                </span>
                <Link href="/partner/corporate/standing" className="inline-flex flex-none items-center gap-1 text-sm font-semibold text-brand-primary hover:underline">
                  {t("overview.manageStanding")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
