export type ReservationStep = "date" | "party" | "slot" | "identity" | "sent";

export type OccasionKind = "" | "birthday" | "anniversary";

export interface ReservationFormState {
  date: string; // ISO yyyy-mm-dd
  guests: number;
  slot: string | null; // e.g. "19:30"
  zone: string | null;
  name: string;
  phone: string;
  email: string;
  notes: string;
  // §11 §6.3 — optional special occasion + its date (captured for the
  // birthday/anniversary triggered campaigns). occasionDate is ISO yyyy-mm-dd.
  occasion: OccasionKind;
  occasionDate: string;
}
