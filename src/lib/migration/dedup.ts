/**
 * §14 §6.3 — migration dedup. A CSV row is a duplicate of an existing
 * reservation IFF (reservation_date, reservation_time, guest_phone, party_size)
 * matches AND guest_phone is present in both (E.164-normalized). Phone-less rows
 * can't be deduped → always import.
 */
export function dedupKey(
  reservationDate: string,
  reservationTime: string,
  phoneE164: string | null,
  partySize: number,
): string | null {
  if (!phoneE164) return null; // phone-less → never a dedup match
  // Normalize HH:MM vs HH:MM:SS to the minute.
  const t = reservationTime.slice(0, 5);
  return `${reservationDate}|${t}|${phoneE164}|${partySize}`;
}

export function isDuplicate(key: string | null, existingKeys: Set<string>): boolean {
  return key !== null && existingKeys.has(key);
}
