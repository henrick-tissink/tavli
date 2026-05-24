/**
 * §11 v1.5 — one-off campaign template library. Starter trilingual copy the
 * partner can prefill and edit. Keyed; channel-defaulted; per-locale subject + body.
 */
export interface CampaignTemplate {
  key: string;
  name: string;
  channel: "email" | "sms" | "whatsapp";
  subject: { ro: string; en: string; de: string };
  body: { ro: string; en: string; de: string };
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    key: "winter_menu",
    name: "Meniu de iarnă",
    channel: "email",
    subject: { ro: "Noul nostru meniu de iarnă", en: "Our new winter menu", de: "Unsere neue Winterkarte" },
    body: {
      ro: "Am adăugat preparate noi de sezon. Rezervă o masă și gustă-le în această săptămână.",
      en: "We've added new seasonal dishes. Book a table and taste them this week.",
      de: "Wir haben neue saisonale Gerichte. Reservieren Sie und probieren Sie sie diese Woche.",
    },
  },
  {
    key: "themed_night",
    name: "Seară tematică",
    channel: "email",
    subject: { ro: "O seară specială te așteaptă", en: "A special evening awaits", de: "Ein besonderer Abend erwartet Sie" },
    body: {
      ro: "Organizăm o seară tematică în curând. Locurile sunt limitate — rezervă din timp.",
      en: "We're hosting a themed night soon. Seats are limited — book early.",
      de: "Wir veranstalten bald einen Themenabend. Plätze sind begrenzt — buchen Sie früh.",
    },
  },
  {
    key: "offpeak_fill",
    name: "Umple orele liniștite",
    channel: "sms",
    subject: { ro: "", en: "", de: "" },
    body: {
      ro: "Masă liberă în seara aceasta. Te așteptăm cu drag — rezervă acum.",
      en: "A table is free tonight. We'd love to see you — book now.",
      de: "Heute Abend ist ein Tisch frei. Wir freuen uns auf Sie — jetzt buchen.",
    },
  },
  {
    key: "holiday_menu",
    name: "Meniu de sărbători",
    channel: "email",
    subject: { ro: "Sărbătorile la noi", en: "The holidays, with us", de: "Die Feiertage bei uns" },
    body: {
      ro: "Meniul nostru de sărbători e disponibil pentru rezervări. Asigură-ți masa.",
      en: "Our holiday menu is open for bookings. Secure your table.",
      de: "Unsere Feiertagskarte ist buchbar. Sichern Sie sich Ihren Tisch.",
    },
  },
];
