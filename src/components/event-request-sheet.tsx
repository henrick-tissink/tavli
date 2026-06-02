"use client";

import { useState, useTransition } from "react";
import { BottomSheet } from "./bottom-sheet";
import { Pill } from "./pill";
import { Button } from "./button";
import { submitEventRequestDraft } from "@/app/api/event-requests/actions";
import { useT } from "@/lib/i18n/messages-provider";

type Occasion = "wedding" | "birthday" | "corporate_dinner" | "product_launch" | "other";

export interface EventRequestSheetProps {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  restaurantName: string;
  acceptedOccasions: Occasion[];
  minLeadDays?: number;
  budgetPerHeadGuidance?: string | null;
}

type Step = "occasion" | "date" | "details" | "identity" | "sent";

export function EventRequestSheet({
  open,
  onClose,
  restaurantId,
  restaurantName,
  acceptedOccasions,
  minLeadDays = 7,
  budgetPerHeadGuidance,
}: EventRequestSheetProps) {
  const t = useT("events");
  const [step, setStep] = useState<Step>("occasion");
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [eventTimePreference, setEventTimePreference] = useState("");
  const [partySize, setPartySize] = useState<number>(20);
  const [spacePreference, setSpacePreference] = useState("");
  const [budgetPerHeadCents, setBudgetPerHeadCents] = useState<number | undefined>();
  const [menuPreference, setMenuPreference] = useState("");
  const [dietaryNotes, setDietaryNotes] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [claimedCompanyCui, setClaimedCompanyCui] = useState("");
  const [claimedCompanyName, setClaimedCompanyName] = useState("");
  const [bookingForCompany, setBookingForCompany] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Earliest event date the venue will consider. minLeadDays comes from the
  // partner's event settings; default of 7 keeps the inbox sane until they
  // tune it. Using local date math so DST/UTC don't drift the floor.
  const minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + minLeadDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();

  function next() {
    if (step === "occasion") return setStep("date");
    if (step === "date") return setStep("details");
    if (step === "details") return setStep("identity");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await submitEventRequestDraft({
          restaurantId,
          guestName,
          guestEmail,
          guestPhone: guestPhone || undefined,
          occasion: occasion!,
          eventDate,
          eventTimePreference: eventTimePreference || undefined,
          partySize,
          spacePreference: spacePreference || undefined,
          budgetPerHeadCents,
          menuPreference: menuPreference || undefined,
          dietaryNotes: dietaryNotes || undefined,
          additionalNotes: additionalNotes || undefined,
          claimedCompanyCui:
            bookingForCompany && claimedCompanyCui ? claimedCompanyCui : undefined,
          claimedCompanyName:
            bookingForCompany && claimedCompanyName ? claimedCompanyName : undefined,
        });
        setStep("sent");
      } catch (e) {
        setError((e as Error).message || t("sheet.errorGeneric"));
      }
    });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`${restaurantName} ${t("sheet.titleSuffix")}`}
    >
      {step === "occasion" && (
        <div className="space-y-3">
          <p className="font-medium">{t("sheet.occasion.heading")}</p>
          <div className="flex flex-wrap gap-2">
            {acceptedOccasions.map((o) => (
              <Pill
                key={o}
                label={t(`sheet.occasion.labels.${o}`)}
                active={occasion === o}
                onToggle={() => setOccasion(o)}
              />
            ))}
          </div>
          <Button disabled={!occasion} onClick={next}>
            {t("sheet.continue")}
          </Button>
        </div>
      )}

      {step === "date" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">{t("sheet.date.label")}</span>
            <input
              type="date"
              min={minDate}
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("sheet.date.timePrefLabel")}</span>
            <input
              type="text"
              placeholder={t("sheet.date.timePrefPlaceholder")}
              value={eventTimePreference}
              onChange={(e) => setEventTimePreference(e.target.value)}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <Button disabled={!eventDate} onClick={next}>
            {t("sheet.continue")}
          </Button>
        </div>
      )}

      {step === "details" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">{t("sheet.details.persoanelLabel")}</span>
            <input
              type="number"
              min={1}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("sheet.details.spaceLabel")}</span>
            <input
              type="text"
              value={spacePreference}
              onChange={(e) => setSpacePreference(e.target.value)}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("sheet.details.budgetLabel")}</span>
            <input
              type="number"
              min={0}
              value={budgetPerHeadCents ? Math.round(budgetPerHeadCents / 100) : ""}
              onChange={(e) =>
                setBudgetPerHeadCents(
                  e.target.value ? Number(e.target.value) * 100 : undefined,
                )
              }
              className="w-full mt-1 border rounded p-2"
            />
            {budgetPerHeadGuidance && (
              <p className="text-xs text-zinc-500 mt-1">{budgetPerHeadGuidance}</p>
            )}
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("sheet.details.menuLabel")}</span>
            <textarea
              value={menuPreference}
              onChange={(e) => setMenuPreference(e.target.value)}
              className="w-full mt-1 border rounded p-2"
              rows={2}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("sheet.details.dietaryLabel")}</span>
            <textarea
              value={dietaryNotes}
              onChange={(e) => setDietaryNotes(e.target.value)}
              className="w-full mt-1 border rounded p-2"
              rows={2}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("sheet.details.notesLabel")}</span>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              className="w-full mt-1 border rounded p-2"
              rows={2}
            />
          </label>
          <Button onClick={next}>{t("sheet.continue")}</Button>
        </div>
      )}

      {step === "identity" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">{t("sheet.identity.nameLabel")}</span>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("sheet.identity.emailLabel")}</span>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("sheet.identity.phoneLabel")}</span>
            <input
              type="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={bookingForCompany}
              onChange={(e) => setBookingForCompany(e.target.checked)}
            />
            {t("sheet.identity.companyCheckLabel")}
          </label>
          {bookingForCompany && (
            <>
              <label className="block">
                <span className="text-sm font-medium">{t("sheet.identity.cuiLabel")}</span>
                <input
                  value={claimedCompanyCui}
                  onChange={(e) => setClaimedCompanyCui(e.target.value)}
                  className="w-full mt-1 border rounded p-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">{t("sheet.identity.companyNameLabel")}</span>
                <input
                  value={claimedCompanyName}
                  onChange={(e) => setClaimedCompanyName(e.target.value)}
                  className="w-full mt-1 border rounded p-2"
                />
              </label>
            </>
          )}
          {error && (
            <p className="text-red-600 text-sm" role="alert">
              {error}
            </p>
          )}
          <Button
            disabled={pending || !guestName || !guestEmail}
            onClick={submit}
          >
            {pending ? t("sheet.submitPending") : t("sheet.submitLabel")}
          </Button>
        </div>
      )}

      {step === "sent" && (
        <div className="space-y-3 text-center py-6">
          <p className="text-xl font-semibold">{t("sheetV2.stepSent.heading")}</p>
          <p className="text-sm text-zinc-600">
            {t("sheetV2.stepSent.body").replace("{email}", guestEmail)}
          </p>
        </div>
      )}
    </BottomSheet>
  );
}
