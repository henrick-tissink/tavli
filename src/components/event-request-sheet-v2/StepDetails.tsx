"use client";

import { useMemo } from "react";
import { RoomPickerTile } from "./RoomPickerTile";
import { useT } from "@/lib/i18n/messages-provider";
import type { PrivateSpaceTile } from "./types";
import type { DraftState } from "./index";

interface Props {
  privateSpaces: PrivateSpaceTile[];
  budgetPerHeadGuidance?: string | null;
  draft: DraftState;
  onChange: (patch: Partial<DraftState>) => void;
  onBack: () => void;
  onNext: () => void;
}

function publicPhotoUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!base) return null;
  return `${base}/storage/v1/object/public/restaurant-photos/${storagePath}`;
}

/**
 * Step 3 — details. Party size + (visual room picker XOR free-text space
 * preference) + budget per head with the venue's inline guidance hint +
 * progressive-disclosure block for menu/dietary/notes.
 */
export function StepDetails({
  privateSpaces,
  budgetPerHeadGuidance,
  draft,
  onChange,
  onBack,
  onNext,
}: Props) {
  const t = useT("events");
  const sortedSpaces = useMemo(
    () => [...privateSpaces].sort((a, b) => a.capacityMin - b.capacityMin),
    [privateSpaces],
  );
  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold text-text-primary">
        {t("sheetV2.stepDetails.heading")}
      </h2>
      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          {t("sheetV2.stepDetails.partySizeLabel")}
        </span>
        <input
          type="number"
          min={1}
          max={500}
          value={draft.partySize}
          onChange={(e) => onChange({ partySize: Number(e.target.value) })}
          className="w-full mt-1 border border-border rounded-card p-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
        />
      </label>

      {sortedSpaces.length > 0 ? (
        <div>
          <p className="text-sm font-medium mb-2 text-text-primary">
            {t("sheetV2.stepDetails.spaceLabel")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {sortedSpaces.map((space) => (
              <RoomPickerTile
                key={space.id}
                space={space}
                selected={draft.privateSpaceId === space.id}
                partySize={draft.partySize}
                publicPhotoUrl={publicPhotoUrl}
                onPick={(id) =>
                  onChange({ privateSpaceId: id, spacePreference: "" })
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("sheetV2.stepDetails.spaceFreeLabel")}
          </span>
          <input
            type="text"
            value={draft.spacePreference}
            onChange={(e) => onChange({ spacePreference: e.target.value })}
            className="w-full mt-1 border border-border rounded-card p-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
          />
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          {t("sheetV2.stepDetails.budgetLabel")}
        </span>
        <input
          type="number"
          min={0}
          step={10}
          value={
            draft.budgetPerHeadCents
              ? Math.round(draft.budgetPerHeadCents / 100)
              : ""
          }
          onChange={(e) =>
            onChange({
              budgetPerHeadCents: e.target.value
                ? Number(e.target.value) * 100
                : undefined,
            })
          }
          className="w-full mt-1 border border-border rounded-card p-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
        />
        {budgetPerHeadGuidance && (
          <p className="text-xs text-[color:var(--color-occasion-corporate)] mt-1.5 font-medium">
            {budgetPerHeadGuidance}
          </p>
        )}
      </label>

      <details className="rounded-card border border-border">
        <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-text-primary">
          {t("sheetV2.stepDetails.menuSectionLabel")}
        </summary>
        <div className="p-3 space-y-2 border-t border-border">
          <textarea
            rows={2}
            placeholder={t("sheetV2.stepDetails.menuPlaceholder")}
            value={draft.menuPreference}
            onChange={(e) => onChange({ menuPreference: e.target.value })}
            className="w-full border border-border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
          />
          <textarea
            rows={2}
            placeholder={t("sheetV2.stepDetails.dietaryPlaceholder")}
            value={draft.dietaryNotes}
            onChange={(e) => onChange({ dietaryNotes: e.target.value })}
            className="w-full border border-border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
          />
          <textarea
            rows={2}
            placeholder={t("sheetV2.stepDetails.notesPlaceholder")}
            value={draft.additionalNotes}
            onChange={(e) => onChange({ additionalNotes: e.target.value })}
            className="w-full border border-border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
          />
        </div>
      </details>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 border border-border rounded-card py-3 font-semibold text-text-primary hover:bg-surface-bg transition-colors"
        >
          {t("sheetV2.stepDetails.back")}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 bg-brand-primary text-surface-white rounded-card py-3 font-semibold hover:bg-brand-primary-dark transition-colors"
        >
          {t("sheetV2.stepDetails.continue")}
        </button>
      </div>
    </div>
  );
}
