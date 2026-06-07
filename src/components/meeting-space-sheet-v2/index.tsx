"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { SheetProgress } from "./SheetProgress";
import { StepDate } from "./StepDate";
import { StepSpace } from "./StepSpace";
import { StepSlot } from "./StepSlot";
import { StepIdentity } from "./StepIdentity";
import { StepSent } from "./StepSent";
import { useT } from "@/lib/i18n/messages-provider";
import type { MeetingDraft, MeetingSpaceTile } from "./types";

type Step = "date" | "space" | "slot" | "identity" | "sent";
const ORDER: Step[] = ["date", "space", "slot", "identity"];

interface Props {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  restaurantName: string;
  spaces: MeetingSpaceTile[];
}

const INITIAL: MeetingDraft = {
  bookingDate: "",
  meetingSpaceId: null,
  durationMinutes: null,
  startMinute: null,
  partySize: 2,
  guestName: "",
  guestEmail: "",
  guestPhone: "",
  company: "",
  notes: "",
};

/**
 * 4-step hourly booking sheet (date → space → slot → identity), mirroring
 * EventRequestSheetV2. State lives here; steps stay pure and receive a
 * draft slice plus an onChange patcher. Request-to-book: a successful submit
 * lands as 'requested' in the partner inbox.
 */
export function MeetingSpaceSheetV2(props: Props) {
  const t = useT("meetingSpaces");
  const [step, setStep] = useState<Step>("date");
  const [draft, setDraft] = useState<MeetingDraft>(INITIAL);
  if (!props.open) return null;
  const stepIndex = ORDER.indexOf(step);
  const update = (patch: Partial<MeetingDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const space = props.spaces.find((s) => s.id === draft.meetingSpaceId) ?? null;

  const slide = {
    initial: { opacity: 0, x: 12 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -12 },
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end desktop:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={props.onClose}
      data-testid="meeting-space-sheet-v2-backdrop"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t("sheet.dialogAriaLabel").replace("{restaurantName}", props.restaurantName)}
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
              {props.restaurantName} {t("sheet.titleSuffix")}
            </p>
            {step !== "sent" && <SheetProgress current={stepIndex + 1} total={ORDER.length} />}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label={t("sheet.closeAriaLabel")}
            className="p-1 rounded hover:bg-surface-bg transition-colors"
          >
            <X className="w-5 h-5 text-text-muted hover:text-text-primary" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait">
            {step === "date" && (
              <motion.div key="date" {...slide}>
                <StepDate
                  value={draft.bookingDate}
                  onChange={update}
                  onNext={() => setStep("space")}
                />
              </motion.div>
            )}
            {step === "space" && (
              <motion.div key="space" {...slide}>
                <StepSpace
                  spaces={props.spaces}
                  selectedId={draft.meetingSpaceId}
                  onPick={(id) =>
                    update({ meetingSpaceId: id, durationMinutes: null, startMinute: null })
                  }
                  onBack={() => setStep("date")}
                  onNext={() => setStep("slot")}
                />
              </motion.div>
            )}
            {step === "slot" && space && (
              <motion.div key="slot" {...slide}>
                <StepSlot
                  restaurantId={props.restaurantId}
                  space={space}
                  bookingDate={draft.bookingDate}
                  durationMinutes={draft.durationMinutes}
                  startMinute={draft.startMinute}
                  onChange={update}
                  onBack={() => setStep("space")}
                  onNext={() => setStep("identity")}
                />
              </motion.div>
            )}
            {step === "identity" && space && (
              <motion.div key="identity" {...slide}>
                <StepIdentity
                  restaurantId={props.restaurantId}
                  space={space}
                  draft={draft}
                  onChange={update}
                  onBack={() => setStep("slot")}
                  onSent={() => setStep("sent")}
                />
              </motion.div>
            )}
            {step === "sent" && draft.startMinute !== null && draft.durationMinutes !== null && (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <StepSent
                  restaurantName={props.restaurantName}
                  bookingDate={draft.bookingDate}
                  startMinute={draft.startMinute}
                  durationMinutes={draft.durationMinutes}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
