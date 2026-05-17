"use client";

import { useState, useTransition } from "react";
import { BottomSheet } from "./bottom-sheet";
import { Pill } from "./pill";
import { Button } from "./button";
import { submitEventRequestDraft } from "@/app/api/event-requests/actions";

const OCCASION_LABELS_RO = {
  wedding: "Nuntă",
  birthday: "Aniversare",
  corporate_dinner: "Cină corporate",
  product_launch: "Lansare produs",
  other: "Altele",
} as const;

type Occasion = keyof typeof OCCASION_LABELS_RO;

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
        setError((e as Error).message || "Ceva nu a mers. Încearcă din nou.");
      }
    });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`${restaurantName} · Eveniment privat`}
    >
      {step === "occasion" && (
        <div className="space-y-3">
          <p className="font-medium">Ce sărbătorim?</p>
          <div className="flex flex-wrap gap-2">
            {acceptedOccasions.map((o) => (
              <Pill
                key={o}
                label={OCCASION_LABELS_RO[o]}
                active={occasion === o}
                onToggle={() => setOccasion(o)}
              />
            ))}
          </div>
          <Button disabled={!occasion} onClick={next}>
            Continuă
          </Button>
        </div>
      )}

      {step === "date" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Dată eveniment</span>
            <input
              type="date"
              min={minDate}
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Preferință oră</span>
            <input
              type="text"
              placeholder="prânz / seară / 18:00"
              value={eventTimePreference}
              onChange={(e) => setEventTimePreference(e.target.value)}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <Button disabled={!eventDate} onClick={next}>
            Continuă
          </Button>
        </div>
      )}

      {step === "details" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Persoane</span>
            <input
              type="number"
              min={1}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Spațiu dorit (opțional)</span>
            <input
              type="text"
              value={spacePreference}
              onChange={(e) => setSpacePreference(e.target.value)}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Buget per persoană (lei, opțional)</span>
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
            <span className="text-sm font-medium">Meniu / dorințe</span>
            <textarea
              value={menuPreference}
              onChange={(e) => setMenuPreference(e.target.value)}
              className="w-full mt-1 border rounded p-2"
              rows={2}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Restricții alimentare</span>
            <textarea
              value={dietaryNotes}
              onChange={(e) => setDietaryNotes(e.target.value)}
              className="w-full mt-1 border rounded p-2"
              rows={2}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Note suplimentare</span>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              className="w-full mt-1 border rounded p-2"
              rows={2}
            />
          </label>
          <Button onClick={next}>Continuă</Button>
        </div>
      )}

      {step === "identity" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Nume</span>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="w-full mt-1 border rounded p-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Telefon (opțional)</span>
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
            Rezervare pentru o companie
          </label>
          {bookingForCompany && (
            <>
              <label className="block">
                <span className="text-sm font-medium">CUI</span>
                <input
                  value={claimedCompanyCui}
                  onChange={(e) => setClaimedCompanyCui(e.target.value)}
                  className="w-full mt-1 border rounded p-2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Denumire companie</span>
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
            {pending ? "Se trimite…" : "Trimite cererea"}
          </Button>
        </div>
      )}

      {step === "sent" && (
        <div className="space-y-3 text-center py-6">
          <p className="text-xl font-semibold">Verifică emailul</p>
          <p className="text-sm text-zinc-600">
            Ți-am trimis un link la <strong>{guestEmail}</strong>. Click pe el ca
            să confirmi cererea — astfel restaurantul o primește în inbox.
          </p>
        </div>
      )}
    </BottomSheet>
  );
}
