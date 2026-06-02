"use client";

import { useT } from "./messages-provider";

/**
 * Locale-aware short date labels for partner dashboard components.
 *
 * The short weekday/month names live in the `partner.common` catalogue as
 * comma-joined strings (the message infra is string-only), keyed so RO stays
 * byte-identical to the legacy hardcoded arrays while EN/DE get translated.
 * `shortDate("YYYY-MM-DD")` renders the established "Weekday Day Month" label
 * (e.g. "Joi 1 mai" / "Thu 1 May" / "Do 1 Mai").
 */
export function usePartnerDateLabels() {
  const tc = useT("partner.common");
  const weekdaysShort = tc("dateFormat.weekdaysShort").split(",");
  const monthsShort = tc("dateFormat.monthsShort").split(",");
  const shortDate = (ymd: string): string => {
    const d = new Date(`${ymd}T12:00:00`);
    return `${weekdaysShort[d.getDay()]} ${d.getDate()} ${monthsShort[d.getMonth()]}`;
  };
  return { weekdaysShort, monthsShort, shortDate };
}
