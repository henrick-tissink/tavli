export type ReservationStep = "date" | "party" | "slot" | "identity" | "sent";

export interface ReservationFormState {
  date: string; // ISO yyyy-mm-dd
  guests: number;
  slot: string | null; // e.g. "19:30"
  zone: string | null;
  name: string;
  phone: string;
  email: string;
  notes: string;
}
