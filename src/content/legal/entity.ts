/**
 * Single source of truth for legal-document placeholders.
 *
 * Replace the [TBD] values once the legal entity is registered.
 * Touch only this file — every legal document picks up the change automatically.
 */
export const ENTITY = {
  name: "[ENTITY NAME — TBD]",
  cui: "[CUI — TBD]",
  jNumber: "[J-NUMBER — TBD]",
  address: "[REGISTERED ADDRESS — TBD]",
  email: "privacy@tavli.ro",
  contactEmail: "hello@tavli.ro",
  appUrl: "https://tavli.ro",
  jurisdiction: "România",
} as const;

export type EntityKey = keyof typeof ENTITY;
