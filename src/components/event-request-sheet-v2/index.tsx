"use client";
import type { Occasion, PrivateSpaceTile } from "./types";

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

export function EventRequestSheetV2(_props: Props) {
  return null; // Filled in Tasks 10–16.
}
