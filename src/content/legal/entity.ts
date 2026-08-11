/**
 * Single source of truth for legal-document placeholders.
 *
 * Values below are taken from the ONRC certificat de înregistrare
 * (seria B nr. 5243234, issued 26.03.2025).
 * Touch only this file — every legal document picks up the change automatically.
 */
export const ENTITY = {
  name: "HENRYTEQ S.R.L.",
  cui: "RO51507076",
  jNumber: "J2025021092007",
  address:
    "Aleea Privighetorilor nr. 85, bl. A, sc. A, et. 2, ap. 20, Sector 1, București, România",
  email: "privacy@tavli.ro",
  contactEmail: "hello@tavli.ro",
  appUrl: "https://tavli.ro",
  jurisdiction: "România",
} as const;

export type EntityKey = keyof typeof ENTITY;
