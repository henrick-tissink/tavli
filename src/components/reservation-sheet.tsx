"use client";

import { useState, useTransition } from "react";
import { CheckCircle } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { RatingBadge } from "./rating-badge";
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

  const dateLabels: Record<DateOption, string> = {
    today: "Today",
    tomorrow: "Tomorrow",
    pick: "Pick date",
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
        setSubmitError(result.error ?? "Booking failed.");
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
      `&text=${encodeURIComponent(`Reservation at ${restaurantName}`)}` +
      `&dates=${fmt(bookingDate)}/${fmt(endDate)}` +
      `&details=${encodeURIComponent(`${guests} guests${selectedZone ? ` · ${selectedZone}` : ""} · Booked via Tavli`)}`;

    const handleShare = async () => {
      const shareData = {
        title: `Reservation at ${restaurantName}`,
        text: `I booked ${restaurantName} for ${dateLabels[dateOption]} at ${selectedSlot} — ${guests} guests. Join me?`,
        url: typeof window !== "undefined" ? window.location.href : "",
      };
      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
          alert("Invite copied to clipboard!");
        }
      } catch {
        // user cancelled or share failed — no-op
      }
    };

    return (
      <BottomSheet open={open} onClose={onClose} title="Reservation">
        <div className="flex flex-col items-center py-6">
          <CheckCircle size={48} className="text-success" />
          <h3 className="text-xl font-bold text-center mt-4">You&apos;re booked!</h3>
          <div className="text-sm text-text-secondary text-center mt-3 space-y-1">
            <p>{restaurantName}</p>
            <p>{dateLabels[dateOption]}</p>
            <p>{selectedSlot}</p>
            <p>{guests} guests</p>
            {selectedZone && <p>{selectedZone}</p>}
          </div>
          <p className="text-xs text-text-muted text-center mt-3">
            {reservationMode === "db" && email
              ? `Confirmation sent to ${email}`
              : reservationMode === "db"
                ? "Reservation saved."
                : "Saved locally (demo mode — set up Supabase to persist reservations)."}
          </p>
          <div className="flex gap-3 mt-6 w-full">
            <a
              href={calHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button variant="secondary" fullWidth>
                Add to Calendar
              </Button>
            </a>
            <Button variant="secondary" fullWidth onClick={handleShare}>
              Share with Friends
            </Button>
          </div>
          <div className="mt-3 w-full">
            <Button variant="primary" fullWidth onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Reserve a table">
      <div className="space-y-5">
        {/* Restaurant name + rating */}
        <div className="flex items-center gap-2">
          <span className="font-bold text-text-primary">{restaurantName}</span>
          <RatingBadge rating={rating} />
        </div>

        {/* Guest selector */}
        <div>
          <p className="text-sm font-medium text-text-primary mb-2">Guests</p>
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
              placeholder="Number of guests"
              className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          )}
        </div>

        {/* Date pills */}
        <div>
          <p className="text-sm font-medium text-text-primary mb-2">Date</p>
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
          <p className="text-sm font-medium text-text-primary mb-2">Time</p>
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
                <p className="text-sm font-medium text-text-primary mb-2">Seating</p>
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
                placeholder="Your name"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-secondary">+40</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (optional)"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Birthday, allergies..."
                rows={2}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
              />
            </div>

            <p className="text-xs text-text-muted">
              🔒 Your details are shared only with this restaurant
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
              {pending ? "Booking…" : "Confirm reservation"}
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
