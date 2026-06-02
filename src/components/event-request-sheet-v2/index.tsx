"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { SheetProgress } from "./SheetProgress";
import { StepOccasion } from "./StepOccasion";
import { StepDate } from "./StepDate";
import { StepDetails } from "./StepDetails";
import { StepIdentity } from "./StepIdentity";
import { StepSent } from "./StepSent";
import { useT } from "@/lib/i18n/messages-provider";
import type { Occasion, PrivateSpaceTile } from "./types";

type Step = "occasion" | "date" | "details" | "identity" | "sent";
const ORDER: Step[] = ["occasion", "date", "details", "identity"];

interface Props {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  restaurantName: string;
  acceptedOccasions: Occasion[];
  privateSpaces: PrivateSpaceTile[];
  minLeadDays?: number;
  budgetPerHeadGuidance?: string | null;
}

export interface DraftState {
  occasion: Occasion | null;
  eventDate: string;
  eventTimePreference: string;
  partySize: number;
  privateSpaceId: string | null;
  spacePreference: string;
  budgetPerHeadCents: number | undefined;
  menuPreference: string;
  dietaryNotes: string;
  additionalNotes: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  bookingForCompany: boolean;
  claimedCompanyCui: string;
  claimedCompanyName: string;
}

const INITIAL: DraftState = {
  occasion: null,
  eventDate: "",
  eventTimePreference: "",
  partySize: 20,
  privateSpaceId: null,
  spacePreference: "",
  budgetPerHeadCents: undefined,
  menuPreference: "",
  dietaryNotes: "",
  additionalNotes: "",
  guestName: "",
  guestEmail: "",
  guestPhone: "",
  bookingForCompany: false,
  claimedCompanyCui: "",
  claimedCompanyName: "",
};

/**
 * Premium 4-step event-request sheet. Renders the imagery-led occasion
 * picker, the lead-time-aware calendar, the details step with optional
 * visual room picker, and the identity step (with optional ANAF CUI
 * lookup) — plus a final animated success confirmation.
 *
 * State lives here so children can stay pure: each step receives the
 * relevant slice of the draft and an `onChange` patcher. Step transitions
 * use AnimatePresence so the user perceives forward/back motion clearly.
 */
export function EventRequestSheetV2(props: Props) {
  const t = useT("events");
  const [step, setStep] = useState<Step>("occasion");
  const [draft, setDraft] = useState<DraftState>(INITIAL);
  if (!props.open) return null;
  const stepIndex = ORDER.indexOf(step);
  const update = (patch: Partial<DraftState>) =>
    setDraft((d) => ({ ...d, ...patch }));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end desktop:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={props.onClose}
      data-testid="event-request-sheet-v2-backdrop"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t("sheetV2.dialogAriaLabel").replace("{restaurantName}", props.restaurantName)}
        initial={{ y: "20%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "20%", opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 220 }}
        className="bg-surface-white w-full desktop:max-w-2xl rounded-t-card desktop:rounded-card shadow-modal h-[92vh] desktop:max-h-[92vh] desktop:h-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              {props.restaurantName} {t("sheetV2.titleSuffix")}
            </p>
            {step !== "sent" && (
              <SheetProgress current={stepIndex + 1} total={ORDER.length} />
            )}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label={t("sheetV2.closeAriaLabel")}
            className="p-1 rounded hover:bg-surface-bg transition-colors"
          >
            <X className="w-5 h-5 text-text-muted hover:text-text-primary" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait">
            {step === "occasion" && (
              <motion.div
                key="occasion"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
              >
                <StepOccasion
                  acceptedOccasions={props.acceptedOccasions}
                  selected={draft.occasion}
                  onPick={(o) => update({ occasion: o })}
                  onNext={() => setStep("date")}
                />
              </motion.div>
            )}
            {step === "date" && (
              <motion.div
                key="date"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
              >
                <StepDate
                  minLeadDays={props.minLeadDays ?? 7}
                  value={draft.eventDate}
                  timePreference={draft.eventTimePreference}
                  onChange={(p) => update(p)}
                  onBack={() => setStep("occasion")}
                  onNext={() => setStep("details")}
                />
              </motion.div>
            )}
            {step === "details" && (
              <motion.div
                key="details"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
              >
                <StepDetails
                  privateSpaces={props.privateSpaces}
                  budgetPerHeadGuidance={props.budgetPerHeadGuidance}
                  draft={draft}
                  onChange={update}
                  onBack={() => setStep("date")}
                  onNext={() => setStep("identity")}
                />
              </motion.div>
            )}
            {step === "identity" && (
              <motion.div
                key="identity"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
              >
                <StepIdentity
                  restaurantId={props.restaurantId}
                  draft={draft}
                  onChange={update}
                  onBack={() => setStep("details")}
                  onSent={() => setStep("sent")}
                />
              </motion.div>
            )}
            {step === "sent" && (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <StepSent email={draft.guestEmail} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
