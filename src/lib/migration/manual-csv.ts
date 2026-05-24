/**
 * §14 §6.1 — the manual Tavli CSV converter (the only v1 source; competitor
 * converters deferred). Parses + validates the canonical reservations template.
 * Pure (no DB) — the import job feeds parsed rows to find-or-create + insert.
 */
import Papa from "papaparse";

export interface ParsedReservationRow {
  reservation_date: string; // YYYY-MM-DD
  reservation_time: string; // HH:MM
  party_size: number;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  notes: string | null;
  status: string | null; // optional explicit status
}

export interface RowError {
  row: number; // 1-based data row number
  code: "TV1202";
  message: string;
}

export interface ParseResult {
  rows: ParsedReservationRow[];
  errors: RowError[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function parseManualCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const rows: ParsedReservationRow[] = [];
  const errors: RowError[] = [];

  parsed.data.forEach((raw, i) => {
    const n = i + 1;
    const date = (raw.reservation_date ?? "").trim();
    const time = (raw.reservation_time ?? "").trim();
    const partySize = Number((raw.party_size ?? "").trim());
    const name = (raw.guest_name ?? "").trim();
    const phone = (raw.guest_phone ?? "").trim() || null;
    const email = (raw.guest_email ?? "").trim() || null;

    if (!DATE_RE.test(date)) return errors.push({ row: n, code: "TV1202", message: `invalid reservation_date "${date}"` });
    if (!TIME_RE.test(time)) return errors.push({ row: n, code: "TV1202", message: `invalid reservation_time "${time}"` });
    if (!Number.isInteger(partySize) || partySize <= 0) return errors.push({ row: n, code: "TV1202", message: `invalid party_size "${raw.party_size}"` });
    if (!name) return errors.push({ row: n, code: "TV1202", message: "missing guest_name" });
    // guest_phone required: reservations.guest_phone is NOT NULL + the dedup key
    // needs it (email stays optional).
    if (!phone) return errors.push({ row: n, code: "TV1202", message: "missing guest_phone" });

    rows.push({
      reservation_date: date,
      reservation_time: time,
      party_size: partySize,
      guest_name: name,
      guest_phone: phone,
      guest_email: email,
      notes: (raw.notes ?? "").trim() || null,
      status: (raw.status ?? "").trim() || null,
    });
  });

  return { rows, errors };
}
