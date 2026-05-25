"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BottomSheet } from "@/components/bottom-sheet";
import { SheetProgress } from "./SheetProgress";
import { StepDate } from "./StepDate";
import { StepParty } from "./StepParty";
import { StepSlot } from "./StepSlot";
import { StepIdentity } from "./StepIdentity";
import { StepSent } from "./StepSent";
import type { ReservationStep, ReservationFormState } from "./types";
import { createReservation } from "@/app/api/reservations/actions";

const STEP_ORDER: ReservationStep[] = ["date", "party", "slot", "identity"];
const STEP_INDEX: Record<ReservationStep, number> = {
  date: 1,
  party: 2,
  slot: 3,
  identity: 4,
  sent: 4,
};

const EMAIL_RE = /.+@.+\..+/;

interface ReservationSheetV2Props {
  open: boolean;
  onClose: () => void;
  restaurantId?: string;
  restaurantName: string;
  /** Accepted for drop-in compatibility with v1; not rendered in v2. */
  rating: number;
  /** Accepted for drop-in compatibility with v1; not rendered in v2. */
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

function makeInitialForm(preSelectedSlot?: string): ReservationFormState {
  return {
    date: "",
    guests: 2,
    slot: preSelectedSlot ?? null,
    zone: null,
    name: "",
    phone: "",
    email: "",
    notes: "",
    occasion: "",
    occasionDate: "",
  };
}

export function ReservationSheetV2({
  open,
  onClose,
  restaurantId,
  restaurantName,
  availableSlots,
  zones,
  preSelectedSlot,
  onBookingConfirmed,
}: ReservationSheetV2Props) {
  const [step, setStep] = useState<ReservationStep>("date");
  const [form, setForm] = useState<ReservationFormState>(
    makeInitialForm(preSelectedSlot),
  );
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<"name" | "phone" | "email" | "notes", string>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Slots for the selected date. Fetched async when `form.date` changes.
  // `null` means "no date picked yet"; `[]` means "fetched, none available".
  // Falls back to the server-rendered `availableSlots` for the FIRST date
  // picked when it matches today, so we don't double-fetch on open.
  const [dateSlots, setDateSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Mirror v1 reopen behaviour: reset state each time open transitions false → true
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStep("date");
      setForm(makeInitialForm(preSelectedSlot));
      setErrors({});
      setSubmitError(null);
      setSubmitting(false);
      setConfirmationToken(null);
      setDateSlots(null);
    }
  }

  const patch = (p: Partial<ReservationFormState>) =>
    setForm((f) => ({ ...f, ...p }));
  // StepIdentity's onChange is string-typed; occasion is a union, so cast here.
  const patchField = (field: string, value: string) =>
    patch({ [field]: value } as Partial<ReservationFormState>);

  // Fetch slots whenever the user picks/changes a date. The API returns every
  // slot for that day-of-week; we filter past slots HERE using the client's
  // local wall clock (server may be UTC while the user is in RO/UTC+3). If the
  // lookup fails we leave slots = [] so the empty-state UX kicks in.
  useEffect(() => {
    if (!open || !form.date || !restaurantId) return;
    const controller = new AbortController();
    setSlotsLoading(true);
    fetch(
      `/api/restaurants/${encodeURIComponent(restaurantId)}/slots?date=${form.date}`,
      { signal: controller.signal },
    )
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((j: { slots?: string[] }) => {
        const raw = Array.isArray(j.slots) ? j.slots : [];
        // If picking today, drop slots already past the local wall clock.
        const now = new Date();
        const localTodayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        let filtered = raw;
        if (form.date === localTodayIso) {
          const cutoff = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          filtered = raw.filter((s) => s > cutoff);
        }
        setDateSlots(filtered);
        // If the previously selected slot isn't in the new list (date changed
        // or now in the past), drop the selection so the user picks again.
        if (form.slot && !filtered.includes(form.slot)) {
          setForm((f) => ({ ...f, slot: null }));
        }
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setDateSlots([]);
      })
      .finally(() => setSlotsLoading(false));
    return () => controller.abort();
    // form.slot is intentionally NOT a dep — we read its current value
    // imperatively to decide whether to clear it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.date, restaurantId]);

  // ── Step validity ──────────────────────────────────────────────────────────
  function isStepValid(s: ReservationStep): boolean {
    switch (s) {
      case "date":
        return form.date !== "";
      case "party":
        return true; // 1–12 enforced inside StepParty
      case "slot":
        return form.slot !== null;
      case "identity":
        if (!form.name.trim() || !form.phone.trim()) return false;
        if (form.email && !EMAIL_RE.test(form.email)) return false;
        return true;
      default:
        return true;
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function handleContinue() {
    if (step === "identity") {
      void handleSubmit();
      return;
    }
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1]!);
    }
  }

  function handleBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) {
      setStep(STEP_ORDER[idx - 1]!);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const newErrors: Partial<Record<"name" | "phone" | "email" | "notes", string>> =
      {};
    if (!form.name.trim()) newErrors.name = "Numele este obligatoriu.";
    if (!form.phone.trim()) newErrors.phone = "Telefonul este obligatoriu.";
    if (form.email && !EMAIL_RE.test(form.email))
      newErrors.email = "Adresă de email invalidă.";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const result = await createReservation({
        restaurantId: restaurantId ?? "",
        date: form.date,
        time: form.slot!,
        partySize: form.guests,
        zone: form.zone ?? undefined,
        guestName: form.name,
        guestPhone: form.phone,
        guestEmail: form.email || undefined,
        notes: form.notes || undefined,
        occasion: form.occasion || undefined,
        occasionDate: form.occasionDate || undefined,
      });
      if (result.ok) {
        setReservationId(result.reservationId ?? null);
        setConfirmationToken(result.confirmationToken ?? null);
        onBookingConfirmed?.({
          restaurantName,
          date: form.date,
          time: form.slot!,
          guests: form.guests,
          reservationId: result.reservationId,
        });
        setStep("sent");
      } else {
        setSubmitError(
          result.error ?? "Rezervarea nu a putut fi trimisă. Încearcă din nou.",
        );
      }
    } catch {
      setSubmitError("Rezervarea nu a putut fi trimisă. Încearcă din nou.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const isFirstStep = step === "date";
  const isLastStep = step === "identity";
  const isSent = step === "sent";
  const currentValid = isStepValid(step);
  const currentProgress = STEP_INDEX[step];

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* ── Custom header (inside BottomSheet's content area via children) ── */}
      {/* BottomSheet renders its own close button, so we only need to add    */}
      {/* the restaurant label + progress bar at the top of our children.     */}
      <div className="mb-4 -mt-1">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          {restaurantName} · Rezervare
        </p>
        {!isSent && (
          <SheetProgress current={currentProgress} total={4} />
        )}
      </div>

      {/* ── Step body ─────────────────────────────────────────────────────── */}
      <div className="overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === "date" && (
            <motion.div
              key="date"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
            >
              <StepDate
                value={form.date || null}
                onSelect={(iso) => patch({ date: iso })}
              />
            </motion.div>
          )}
          {step === "party" && (
            <motion.div
              key="party"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
            >
              <StepParty
                value={form.guests}
                onChange={(n) => patch({ guests: n })}
              />
            </motion.div>
          )}
          {step === "slot" && (
            <motion.div
              key="slot"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
            >
              <StepSlot
                availableSlots={dateSlots ?? availableSlots}
                zones={zones}
                selectedSlot={form.slot}
                selectedZone={form.zone}
                loading={slotsLoading}
                onSelectSlot={(s) => patch({ slot: s })}
                onSelectZone={(z) => patch({ zone: z })}
              />
            </motion.div>
          )}
          {step === "identity" && (
            <motion.div
              key="identity"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
            >
              <StepIdentity
                date={form.date}
                slot={form.slot!}
                guests={form.guests}
                zone={form.zone}
                name={form.name}
                phone={form.phone}
                email={form.email}
                notes={form.notes}
                occasion={form.occasion}
                occasionDate={form.occasionDate}
                onChange={patchField}
                errors={errors}
              />
              {submitError && (
                <p
                  className="mt-3 text-sm text-error bg-red-50 border border-red-200 rounded-button px-3 py-2"
                  role="alert"
                >
                  {submitError}
                </p>
              )}
            </motion.div>
          )}
          {step === "sent" && (
            <motion.div
              key="sent"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.16 }}
            >
              <StepSent
                restaurantName={restaurantName}
                date={form.date}
                slot={form.slot!}
                guests={form.guests}
                confirmationToken={confirmationToken}
                onClose={onClose}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Sticky footer ─────────────────────────────────────────────────── */}
      {!isSent && (
        <div className="mt-4 pt-4 border-t border-border bg-surface-white">
          <div className={`flex gap-3 ${isFirstStep ? "" : "items-center"}`}>
            {!isFirstStep && (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-3 rounded-button border border-border text-sm font-semibold text-text-primary bg-surface-white hover:bg-surface-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                Înapoi
              </button>
            )}
            <button
              type="button"
              disabled={!currentValid || submitting}
              onClick={handleContinue}
              className={`flex-1 py-3 rounded-button bg-brand-primary text-white text-sm font-semibold hover:bg-brand-primary-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:opacity-40 disabled:cursor-not-allowed ${
                isFirstStep ? "w-full" : ""
              }`}
            >
              {submitting
                ? "Se trimite..."
                : isLastStep
                  ? "Trimite rezervarea"
                  : "Continuă"}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
