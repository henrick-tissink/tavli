import { ro, enGB, de } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import type { Locale as AppLocale } from "./locale";

/**
 * Map the app locale to the matching date-fns locale, so calendars (react-day-
 * picker) and date-fns `format()` render month names, weekday headers and full
 * dates in the user's language instead of a hardcoded one. English uses en-GB to
 * match our BCP47 mapping (DD/MM, Monday-first).
 */
export const DATE_FNS_LOCALES: Record<AppLocale, DateFnsLocale> = {
  ro,
  en: enGB,
  de,
};
