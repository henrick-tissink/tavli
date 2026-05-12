"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle, ShieldCheck, Scale } from "lucide-react";
import Link from "next/link";
import { BottomSheet } from "./bottom-sheet";
import { RatingChip } from "./rating-chip";
import { TimeSlotPills } from "./time-slot-pills";
import { Pill } from "./pill";
import { Button } from "./button";
import { createReservation } from "@/app/api/reservations/actions";

const RO_DATE_FORMAT = new Intl.DateTimeFormat("ro-RO", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

// Returns a Date at local midnight for a YYYY-MM-DD string (avoids the UTC
// drift you get from `new Date("2026-05-12")`).
function localDateFromIso(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface ReservationSheetProps {
  open: boolean;
  onClose: () => void;
  restaurantId?: string;
  restaurantName: string;
  rating: number;
  voteCount?: number;
  availableSlots: string[];
  zones?: string[];
  preSelectedSlot?: string;
  onBookingConfirmed?: (data: {
    restaurantName: string;
    date: string;
    time: string;
    guests: number;
    reservationId?: string;
  }) => void;
}

type DateOption = "today" | "tomorrow" | "pick";

export function ReservationSheet({
  open,
  onClose,
  restaurantId,
  restaurantName,
  rating,
  voteCount = 0,
  availableSlots,
  zones,
  preSelectedSlot,
  onBookingConfirmed,
}: ReservationSheetProps) {
  const [step, setStep] = useState<"selecting" | "confirmed">("selecting");
  const [guests, setGuests] = useState(2);
  const [guestInput, setGuestInput] = useState("");
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [dateOption, setDateOption] = useState<DateOption>("today");
  const [pickedDate, setPickedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(preSelectedSlot ?? null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reservationMode, setReservationMode] = useState<"db" | "mock" | null>(null);
  const [pending, startTransition] = useTransition();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const todayIso = isoDate(new Date());
  const maxDateIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return isoDate(d);
  })();

  // Sheet stays mounted across open/close cycles. On every transition to
  // open, re-sync state from props so a fresh tap from the detail page's
  // "Available tonight" pills lands on the right slot, and reopens don't
  // drop the user back into a stale "confirmed" view.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSelectedSlot(preSelectedSlot ?? null);
      setStep("selecting");
      setSubmitError(null);
    }
  }

  const dateLabels: Record<DateOption, string> = {
    today: "Astăzi",
    tomorrow: "Mâine",
    pick: "Alege data",
  };

  // Source of truth for the chosen calendar day. Returns null when the user
  // selected "pick" but hasn't picked yet — confirm stays blocked.
  const getBookingDate = (): Date | null => {
    if (dateOption === "pick") {
      if (!pickedDate) return null;
      return localDateFromIso(pickedDate);
    }
    const d = new Date();
    if (dateOption === "tomorrow") d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Display label for the chosen date. When the user picked a custom day,
  // format it Romanian-style instead of showing the literal "Alege data".
  const dateDisplayLabel =
    dateOption === "pick" && pickedDate
      ? RO_DATE_FORMAT.format(localDateFromIso(pickedDate))
      : dateLabels[dateOption];

  const canConfirm =
    name.trim().length > 0 &&
    phone.trim().length > 0 &&
    (dateOption !== "pick" || pickedDate.length > 0);

  const handleConfirm = () => {
    if (!canConfirm || !selectedSlot) return;
    setSubmitError(null);

    const bookingDate = getBookingDate();
    if (!bookingDate) return;
    const dateStr = isoDate(bookingDate);

    startTransition(async () => {
      const result = await createReservation({
        restaurantId: restaurantId ?? "",
        date: dateStr,
        time: selectedSlot,
        partySize: guests,
        zone: selectedZone ?? undefined,
        guestName: name,
        guestPhone: phone,
        guestEmail: email || undefined,
        notes: notes || undefined,
      });

      if (!result.ok) {
        setSubmitError(result.error ?? "Rezervarea nu a putut fi trimisă.");
        return;
      }

      setReservationMode(result.mode);
      onBookingConfirmed?.({
        restaurantName,
        date: dateDisplayLabel,
        time: selectedSlot,
        guests,
        reservationId: result.reservationId,
      });
      setStep("confirmed");
    });
  };

  if (step === "confirmed") {
    const bookingDate = getBookingDate() ?? new Date();
    const [hh = "19", mm = "00"] = (selectedSlot ?? "19:00").split(":");
    bookingDate.setHours(Number(hh), Number(mm), 0, 0);
    const endDate = new Date(bookingDate.getTime() + 2 * 60 * 60 * 1000);
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const calHref =
      `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(`Rezervare la ${restaurantName}`)}` +
      `&dates=${fmt(bookingDate)}/${fmt(endDate)}` +
      `&details=${encodeURIComponent(`${guests} ${guests === 1 ? "persoană" : "persoane"}${selectedZone ? ` · ${selectedZone}` : ""} · Rezervat prin Tavli`)}`;

    const handleShare = async () => {
      const shareData = {
        title: `Rezervare la ${restaurantName}`,
        text: `Am rezervat la ${restaurantName} pentru ${dateDisplayLabel} la ${selectedSlot} — ${guests} ${guests === 1 ? "persoană" : "persoane"}. Vii și tu?`,
        url: typeof window !== "undefined" ? window.location.href : "",
      };
      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
          alert("Invitație copiată în clipboard!");
        }
      } catch {
        // user cancelled or share failed — no-op
      }
    };

    return (
      <BottomSheet open={open} onClose={onClose} title="Rezervare">
        <div className="flex flex-col items-center py-6">
          <CheckCircle size={48} className="text-success" />
          <h3 className="text-xl font-bold text-center mt-4">Rezervarea ta este confirmată!</h3>
          <div className="text-sm text-text-secondary text-center mt-3 space-y-1">
            <p>{restaurantName}</p>
            <p>{dateDisplayLabel}</p>
            <p>{selectedSlot}</p>
            <p>{guests} {guests === 1 ? "persoană" : "persoane"}</p>
            {selectedZone && <p>{selectedZone}</p>}
          </div>
          <p className="text-xs text-text-muted text-center mt-3">
            {reservationMode === "db" && email
              ? `Confirmare trimisă la ${email}`
              : reservationMode === "db"
                ? "Rezervarea a fost salvată."
                : "Salvată local (mod demo — configurează Supabase pentru a persista rezervările)."}
          </p>
          <div className="flex gap-3 mt-6 w-full">
            <a
              href={calHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button variant="secondary" fullWidth>
                Adaugă în calendar
              </Button>
            </a>
            <Button variant="secondary" fullWidth onClick={handleShare}>
              Trimite prietenilor
            </Button>
          </div>
          <div className="mt-3 w-full">
            <Button variant="primary" fullWidth onClick={onClose}>
              Gata
            </Button>
          </div>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Rezervă o masă">
      <div className="space-y-5">
        {/* Restaurant name + rating */}
        <div className="flex items-center gap-2">
          <span className="font-bold text-text-primary">{restaurantName}</span>
          <RatingChip rating={rating} voteCount={voteCount} />
        </div>

        {/* Guest selector */}
        <div>
          <p className="text-sm font-medium text-text-primary mb-2">Persoane</p>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setGuests(n);
                  setShowGuestInput(false);
                }}
                className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                  guests === n && !showGuestInput
                    ? "bg-brand-primary text-white"
                    : "bg-surface-bg text-text-secondary"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowGuestInput(true)}
              className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                showGuestInput
                  ? "bg-brand-primary text-white"
                  : "bg-surface-bg text-text-secondary"
              }`}
            >
              7+
            </button>
          </div>
          {showGuestInput && (
            <input
              type="number"
              min={7}
              value={guestInput}
              onChange={(e) => {
                setGuestInput(e.target.value);
                const val = parseInt(e.target.value, 10);
                if (val >= 7) setGuests(val);
              }}
              placeholder="Număr de persoane"
              className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          )}
        </div>

        {/* Date pills */}
        <div>
          <p className="text-sm font-medium text-text-primary mb-2">Data</p>
          <div className="flex items-center gap-2">
            {(["today", "tomorrow", "pick"] as DateOption[]).map((opt) => (
              <Pill
                key={opt}
                label={
                  opt === "pick" && pickedDate
                    ? RO_DATE_FORMAT.format(localDateFromIso(pickedDate))
                    : dateLabels[opt]
                }
                active={dateOption === opt}
                onToggle={() => {
                  setDateOption(opt);
                  if (opt === "pick") {
                    // Pop the native calendar immediately so the pill feels
                    // like a button to a calendar, not a state toggle.
                    requestAnimationFrame(() => {
                      const el = dateInputRef.current;
                      if (!el) return;
                      try {
                        el.showPicker();
                      } catch {
                        el.focus();
                      }
                    });
                  }
                }}
              />
            ))}
          </div>
          <input
            ref={dateInputRef}
            type="date"
            value={pickedDate}
            min={todayIso}
            max={maxDateIso}
            onChange={(e) => {
              setPickedDate(e.target.value);
              setDateOption("pick");
            }}
            aria-label="Alege data rezervării"
            // sr-only-ish: keep in DOM so showPicker() has something to anchor,
            // but only reveal as a visible field when the pick option is active
            // and no date is chosen yet.
            className={
              dateOption === "pick" && !pickedDate
                ? "mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                : "sr-only"
            }
          />
        </div>

        {/* Time slots */}
        <div>
          <p className="text-sm font-medium text-text-primary mb-2">Ora</p>
          <TimeSlotPills
            slots={availableSlots}
            selected={selectedSlot ?? undefined}
            maxVisible={6}
            onSelect={(slot) => setSelectedSlot(slot)}
          />
        </div>

        {/* After slot selection: zone + form */}
        {selectedSlot && (
          <>
            {/* Zone selector */}
            {zones && zones.length > 0 && (
              <div>
                <p className="text-sm font-medium text-text-primary mb-2">Loc</p>
                <div className="flex items-center gap-2">
                  {zones.map((zone) => (
                    <Pill
                      key={zone}
                      label={zone}
                      active={selectedZone === zone}
                      onToggle={() => setSelectedZone(zone === selectedZone ? null : zone)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Form fields */}
            <div className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Numele tău"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-secondary">+40</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Număr de telefon"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (opțional)"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Aniversare, alergii…"
                rows={2}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
              />
            </div>

            <p className="text-xs text-text-muted">
              🔒 Datele tale sunt împărtășite doar cu acest restaurant
            </p>

            {submitError && (
              <p
                className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                role="alert"
              >
                {submitError}
              </p>
            )}

            <div className="px-4 pb-3 pt-1">
              <p className="text-[11px] leading-snug text-text-muted text-center">
                Prin rezervare, accepți{" "}
                <Link href="/termeni" className="underline hover:text-text-secondary">Termenii</Link>
                {" "}și{" "}
                <Link href="/confidentialitate" className="underline hover:text-text-secondary">Politica de confidențialitate</Link>.
              </p>
              <div className="mt-2 flex items-center justify-center gap-4">
                <a
                  href="https://anpc.ro/ce-este-sal/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="ANPC SAL"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted hover:text-text-secondary"
                >
                  <ShieldCheck size={12} /> ANPC SAL
                </a>
                <a
                  href="https://ec.europa.eu/consumers/odr"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="EU ODR"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted hover:text-text-secondary"
                >
                  <Scale size={12} /> EU ODR
                </a>
              </div>
            </div>

            <Button
              fullWidth
              disabled={!canConfirm || pending}
              onClick={handleConfirm}
            >
              {pending ? "Se rezervă…" : "Confirmă rezervarea"}
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
