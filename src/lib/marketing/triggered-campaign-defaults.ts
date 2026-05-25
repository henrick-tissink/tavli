/**
 * §11 §6 — default triggered-campaign definitions (PURE data, no server-only,
 * no db). Imported by the server-only seeder (triggered-defaults.ts) AND the
 * one-shot backfill script (which can't import server-only modules).
 *
 * Copy is intentionally TOKEN-FREE: the v1 send leaf does a locale-pick only
 * and does NOT substitute personalisation tokens (see send-message-handler.ts),
 * so any `{{token}}` would render literally. tokens_used stays empty.
 *
 * All five default campaigns ship active: post_visit_review / no_show_followup
 * (reservation events), welcome_series (diner.created), lapsed_60 (nightly
 * diner.lapsed-scan), birthday_anniversary (nightly diner.birthday-scan; fires
 * for diners with a captured birthday_date). welcome_series ships as a single
 * welcome email — the M+7/M+30 drip needs a sequence engine, deferred past v1.
 */

type Loc = { ro: string; en: string; de: string };

export interface TriggeredCampaignDefault {
  key: string;
  name: string;
  channel: "email";
  triggerEvent: string;
  triggerOffsetSeconds: number;
  status: "active" | "paused";
  subject: Loc;
  body: Loc;
  preview: Loc;
}

const HOUR = 3600;
const DAY = 86_400;

export const TRIGGERED_CAMPAIGN_DEFAULTS: TriggeredCampaignDefault[] = [
  {
    key: "post_visit_review",
    name: "Mulțumim pentru vizită",
    channel: "email",
    triggerEvent: "reservation.completed",
    triggerOffsetSeconds: 2 * HOUR,
    status: "active",
    subject: {
      ro: "Mulțumim că ne-ai vizitat",
      en: "Thanks for visiting",
      de: "Danke für Ihren Besuch",
    },
    body: {
      ro: "Ne-a făcut plăcere să te avem ca oaspete. Dacă ai un minut, o recenzie ne-ar ajuta enorm — spune-ne cum a fost.",
      en: "It was a pleasure having you. If you have a minute, a quick review would mean a lot — tell us how it went.",
      de: "Es war uns eine Freude, Sie als Gast zu haben. Wenn Sie eine Minute haben, würde uns eine kurze Bewertung sehr helfen.",
    },
    preview: {
      ro: "Cum a fost experiența ta?",
      en: "How was your experience?",
      de: "Wie war Ihr Besuch?",
    },
  },
  {
    key: "no_show_followup",
    name: "Ne-a părut rău că nu ne-am văzut",
    channel: "email",
    triggerEvent: "reservation.no_show",
    triggerOffsetSeconds: 2 * HOUR,
    status: "active",
    subject: {
      ro: "Ne-a părut rău că nu ne-am văzut",
      en: "Sorry we missed you",
      de: "Schade, dass wir uns verpasst haben",
    },
    body: {
      ro: "Nu am reușit să te întâmpinăm de data aceasta — sperăm că totul e bine. Te așteptăm cu drag data viitoare; rezervă oricând îți este la îndemână.",
      en: "We didn't get to welcome you this time — we hope all is well. We'd love to see you next time; book whenever suits you.",
      de: "Wir konnten Sie diesmal nicht begrüßen — wir hoffen, alles ist in Ordnung. Wir freuen uns auf Ihren nächsten Besuch; buchen Sie jederzeit.",
    },
    preview: {
      ro: "Te așteptăm data viitoare",
      en: "We'd love to see you next time",
      de: "Bis zum nächsten Mal",
    },
  },
  {
    key: "welcome_series",
    name: "Bun venit",
    channel: "email",
    triggerEvent: "diner.created",
    triggerOffsetSeconds: 1 * DAY,
    status: "active",
    subject: { ro: "Bun venit", en: "Welcome", de: "Willkommen" },
    body: {
      ro: "Mulțumim că ai ales să rezervi la noi. Abia așteptăm să te avem ca oaspete — dacă ai întrebări, răspunde la acest email oricând.",
      en: "Thanks for booking with us. We can't wait to host you — if you have any questions, just reply to this email.",
      de: "Danke für Ihre Reservierung. Wir freuen uns darauf, Sie zu bewirten — bei Fragen antworten Sie einfach auf diese E-Mail.",
    },
    preview: {
      ro: "Ne bucurăm că ești aici",
      en: "We're glad you're here",
      de: "Schön, dass Sie da sind",
    },
  },
  {
    key: "birthday_anniversary",
    name: "La mulți ani",
    channel: "email",
    triggerEvent: "diner.birthday",
    // Sends immediately; the −7-day lead time is applied by the nightly
    // diner.birthday-scan job (which emits 7 days before the birthday).
    triggerOffsetSeconds: 0,
    // Active: the birthday scan emits diner.birthday for diners with a
    // captured birthday_date (booking-widget occasion field or diner editor).
    status: "active",
    subject: { ro: "La mulți ani de la noi", en: "Happy birthday from us", de: "Alles Gute zum Geburtstag" },
    body: {
      ro: "Se apropie ziua ta — la mulți ani din partea noastră! Ne-ar bucura să sărbătorești cu noi; rezervă o masă oricând.",
      en: "Your birthday is coming up — happy birthday from all of us! We'd love for you to celebrate with us; book a table anytime.",
      de: "Ihr Geburtstag steht bevor — alles Gute von uns allen! Feiern Sie gerne mit uns; reservieren Sie jederzeit einen Tisch.",
    },
    preview: { ro: "Un gând bun de ziua ta", en: "A little birthday note", de: "Ein Geburtstagsgruß" },
  },
  {
    key: "lapsed_60",
    name: "Ne e dor de tine",
    channel: "email",
    triggerEvent: "diner.lapsed_60d",
    triggerOffsetSeconds: 0,
    // Active: the nightly diner.lapsed-scan job (handlers/diners.ts) now emits
    // diner.lapsed_60d on the 60-day boundary.
    status: "active",
    subject: { ro: "Ne e dor de tine", en: "We miss you", de: "Wir vermissen Sie" },
    body: {
      ro: "A trecut ceva timp de la ultima ta vizită și ne e dor de tine. Te așteptăm cu drag — rezervă o masă când îți dorești.",
      en: "It's been a while since your last visit and we miss you. We'd love to have you back — book a table whenever you like.",
      de: "Ihr letzter Besuch ist eine Weile her und wir vermissen Sie. Wir freuen uns auf Sie — reservieren Sie jederzeit einen Tisch.",
    },
    preview: { ro: "A trecut prea mult timp", en: "It's been too long", de: "Es ist zu lange her" },
  },
];
