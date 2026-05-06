"use client";

import { useState, useTransition } from "react";
import { CheckCircle } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { RatingChip } from "./rating-chip";
import { TimeSlotPills } from "./time-slot-pills";
import { Pill } from "./pill";
import { Button } from "./button";
import { createReservation } from "@/app/api/reservations/actions";

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
  const [selectedSlot, setSelectedSlot] = useState<string | null>(preSelectedSlot ?? null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reservationMode, setReservationMode] = useState<"db" | "mock" | null>(null);
  const [pending, startTransition] = useTransition();

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

  const canConfirm = name.trim().length > 0 && phone.trim().length > 0;

  const handleConfirm = () => {
    if (!canConfirm || !selectedSlot) return;
    setSubmitError(null);

    const bookingDate = new Date();
    if (dateOption === "tomorrow") bookingDate.setDate(bookingDate.getDate() + 1);
    const dateStr = bookingDate.toISOString().slice(0, 10);

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
        date: dateLabels[dateOption],
        time: selectedSlot,
        guests,
        reservationId: result.reservationId,
      });
      setStep("confirmed");
    });
  };

  if (step === "confirmed") {
    const bookingDate = new Date();
    if (dateOption === "tomorrow") bookingDate.setDate(bookingDate.getDate() + 1);
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
        text: `Am rezervat la ${restaurantName} pentru ${dateLabels[dateOption]} la ${selectedSlot} — ${guests} ${guests === 1 ? "persoană" : "persoane"}. Vii și tu?`,
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
            <p>{dateLabels[dateOption]}</p>
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
                label={dateLabels[opt]}
                active={dateOption === opt}
                onToggle={() => setDateOption(opt)}
              />
            ))}
          </div>
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
