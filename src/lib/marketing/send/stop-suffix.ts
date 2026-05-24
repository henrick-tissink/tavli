/**
 * §11 §5.3 / foundations §7.1 — locale STOP suffix appended to every marketing
 * SMS. No-op if the body already ends with a STOP affordance.
 */
type Locale = "ro" | "en" | "de";

function suffixFor(locale: Locale, shortcode: string): string {
  switch (locale) {
    case "ro":
      return ` STOP la ${shortcode} pentru dezabonare`;
    case "en":
      return " Reply STOP to unsubscribe";
    case "de":
      return " Antworten Sie mit STOP zum Abmelden";
  }
}

function asLocale(v: string): Locale {
  return v === "en" || v === "de" ? v : "ro";
}

export function appendStopSuffix(body: string, locale: string, shortcode = "TAVLI"): string {
  // Already has a STOP affordance? leave it.
  if (/\bSTOP\b/i.test(body)) return body;
  return body.trimEnd() + suffixFor(asLocale(locale), shortcode);
}
