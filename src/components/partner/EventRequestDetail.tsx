"use client";

import { useState, useTransition } from "react";
import {
  Calendar,
  Users,
  Mail,
  Phone,
  User,
  DoorOpen,
  Wallet,
  UtensilsCrossed,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { Button } from "@/components/button";
import { QuoteForm } from "./QuoteForm";
import { DeclineForm } from "./DeclineForm";
import { MaterializeReservationForm } from "./MaterializeReservationForm";
import { RevenueEstimateWidget } from "./RevenueEstimateWidget";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { formatNumber } from "@/lib/i18n/format";
import {
  markEventRequestViewing,
  replyToEventRequest,
} from "@/app/api/event-requests/actions";

interface ER {
  id: string;
  status: string;
  occasion: string;
  eventDate: string;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  spacePreference: string | null;
  budgetPerHeadCents: number | null;
  menuPreference: string | null;
  dietaryNotes: string | null;
  additionalNotes: string | null;
  partnerResponse: string | null;
  quotedAmountCents: number | null;
  privateSpaceName: string | null;
  claimedCompanyCui: string | null;
  claimedCompanyName: string | null;
}

function IconField({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 mt-0.5 text-text-muted shrink-0" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-text-muted">
          {label}
        </p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border p-3 bg-surface-white">
      <p className="text-xs uppercase tracking-wider text-text-muted mb-1">
        {label}
      </p>
      <p className="text-sm whitespace-pre-line">{children}</p>
    </div>
  );
}

export function EventRequestDetail({
  er,
  overlaps,
}: {
  er: ER;
  overlaps: { id: string; reservationTime: string; partySize: number }[];
}) {
  const t = useT("partner.corporate");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<
    "detail" | "quote" | "decline" | "materialize"
  >("detail");
  const [replyText, setReplyText] = useState("");
  const occasionKey = t(`occasion.${er.occasion}`);
  const occasionLabel =
    occasionKey === `occasion.${er.occasion}` ? er.occasion : occasionKey;

  return (
    <main className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">
          {t("detail.header", { occasion: occasionLabel, partySize: er.partySize })}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {t("detail.subtitle", {
            guestName: er.guestName,
            eventDate: er.eventDate,
          })}
        </p>
      </header>

      {overlaps.length > 0 && (
        <div className="border border-amber-400 bg-amber-50 rounded-card p-3 text-sm mb-6 inline-flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <span>
            {t("detail.overlapWarning", { count: overlaps.length })}
          </span>
        </div>
      )}

      <div className="grid gap-6 desktop:grid-cols-3">
        <div className="desktop:col-span-2 space-y-6">
          <section className="rounded-card border border-border bg-surface-white p-4">
            <h2 className="font-display text-lg font-bold mb-4">
              {t("detail.eventDetailsTitle")}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <IconField
                icon={Calendar}
                label={t("detail.fieldDate")}
                value={er.eventDate}
              />
              <IconField
                icon={Users}
                label={t("detail.fieldPartySize")}
                value={`${er.partySize}`}
              />
              {er.spacePreference && (
                <IconField
                  icon={DoorOpen}
                  label={t("detail.fieldSpacePreference")}
                  value={er.spacePreference}
                />
              )}
              {er.privateSpaceName && (
                <IconField
                  icon={DoorOpen}
                  label={t("detail.fieldPrivateSpace")}
                  value={er.privateSpaceName}
                />
              )}
              {er.budgetPerHeadCents != null && (
                <IconField
                  icon={Wallet}
                  label={t("detail.fieldBudgetPerHead")}
                  value={t("detail.budgetValue", {
                    amount: formatNumber(
                      Math.round(er.budgetPerHeadCents / 100),
                      locale,
                    ),
                  })}
                />
              )}
              {er.menuPreference && (
                <IconField
                  icon={UtensilsCrossed}
                  label={t("detail.fieldMenu")}
                  value={er.menuPreference}
                />
              )}
            </div>
          </section>

          {(er.dietaryNotes || er.additionalNotes) && (
            <section className="space-y-3">
              {er.dietaryNotes && (
                <Block label={t("detail.dietaryNotesLabel")}>
                  {er.dietaryNotes}
                </Block>
              )}
              {er.additionalNotes && (
                <Block label={t("detail.additionalNotesLabel")}>
                  {er.additionalNotes}
                </Block>
              )}
            </section>
          )}

          {er.partnerResponse && (
            <section className="rounded-card border border-border bg-surface-bg p-4">
              <p className="text-xs uppercase tracking-wider text-text-muted mb-1">
                {t("detail.previousResponseLabel")}
              </p>
              <p className="whitespace-pre-line text-sm">
                {er.partnerResponse}
              </p>
            </section>
          )}

          {view === "detail" && (
            <section className="space-y-3">
              {(er.status === "new" ||
                er.status === "viewing" ||
                er.status === "replied") && (
                <>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="w-full border border-border rounded-card p-2"
                    rows={3}
                    maxLength={2000}
                    placeholder={t("detail.replyPlaceholder")}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={pending || replyText.trim().length === 0}
                      onClick={() =>
                        startTransition(() =>
                          replyToEventRequest({
                            id: er.id,
                            message: replyText,
                          }).then(() => location.reload()),
                        )
                      }
                    >
                      {t("detail.sendReply")}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setView("quote")}
                    >
                      {t("detail.sendQuote")}
                    </Button>
                    <Button variant="ghost" onClick={() => setView("decline")}>
                      {t("detail.decline")}
                    </Button>
                  </div>
                </>
              )}
              {er.status === "accepted" && (
                <Button onClick={() => setView("materialize")}>
                  {t("detail.createReservation")}
                </Button>
              )}
              {er.status === "new" && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    startTransition(() =>
                      markEventRequestViewing({ id: er.id }).then(() =>
                        location.reload(),
                      ),
                    )
                  }
                >
                  {t("detail.markViewing")}
                </Button>
              )}
            </section>
          )}
          {view === "quote" && (
            <QuoteForm
              eventRequestId={er.id}
              partySize={er.partySize}
              budgetPerHeadCents={er.budgetPerHeadCents}
              onCancel={() => setView("detail")}
            />
          )}
          {view === "decline" && (
            <DeclineForm
              eventRequestId={er.id}
              onCancel={() => setView("detail")}
            />
          )}
          {view === "materialize" && (
            <MaterializeReservationForm
              eventRequestId={er.id}
              eventDate={er.eventDate}
              partySize={er.partySize}
              onCancel={() => setView("detail")}
            />
          )}
        </div>

        <aside className="space-y-4">
          <RevenueEstimateWidget
            partySize={er.partySize}
            budgetPerHeadCents={er.budgetPerHeadCents}
          />
          <section className="rounded-card border border-border bg-surface-white p-4">
            <h3 className="font-display text-base font-bold mb-3">
              {t("detail.clientTitle")}
            </h3>
            <div className="space-y-3">
              <IconField
                icon={User}
                label={t("detail.fieldName")}
                value={er.guestName}
              />
              <IconField
                icon={Mail}
                label={t("detail.fieldEmail")}
                value={er.guestEmail}
              />
              {er.guestPhone && (
                <IconField
                  icon={Phone}
                  label={t("detail.fieldPhone")}
                  value={er.guestPhone}
                />
              )}
              {(er.claimedCompanyName || er.claimedCompanyCui) && (
                <IconField
                  icon={Building2}
                  label={t("detail.fieldCompany")}
                  value={
                    <>
                      {er.claimedCompanyName ?? t("detail.companyEmpty")}
                      {er.claimedCompanyCui && (
                        <span className="block text-xs text-text-muted">
                          {t("detail.companyCui", { cui: er.claimedCompanyCui })}
                        </span>
                      )}
                    </>
                  }
                />
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
