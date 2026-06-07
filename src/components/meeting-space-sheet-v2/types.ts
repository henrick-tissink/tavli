export interface MeetingSpaceTile {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  hourlyRateCents: number;
  amenities: string[];
  openTime: string; // "HH:MM" or "HH:MM:SS"
  closeTime: string;
  minBookingMinutes: number;
  photoStoragePath: string | null;
}

export interface MeetingDraft {
  bookingDate: string; // YYYY-MM-DD, "" until picked
  meetingSpaceId: string | null;
  durationMinutes: number | null;
  startMinute: number | null;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  company: string;
  notes: string;
}
