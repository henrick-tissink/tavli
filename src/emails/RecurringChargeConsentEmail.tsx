/**
 * RecurringChargeConsentEmail — §12 §7.3 step 2 (PSD2 recital-15 evidence).
 *
 * Sent within 60s of setup_intent.succeeded (by W5-D's webhook handler) once a
 * card is on file. Its provider message id is captured in billing_audit_log
 * (psd2_consent_captured) as the explicit merchant-initiated-transaction
 * consent trail. RO/EN/DE copy inline.
 *
 * Built in W5-C; the actual send is wired in W5-D's setup_intent handler.
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export type Locale = "ro" | "en" | "de";

export interface RecurringChargeConsentEmailProps {
  locale: Locale;
  chargeDescription?: string;
}

const COPY = {
  ro: {
    preview: "Confirmare card înregistrat la Tavli",
    heading: "Card înregistrat — confirmare plată recurentă",
    para1: (what: string) =>
      `Cardul tău este acum înregistrat pentru ${what}. La finalul perioadei gratuite, vom iniția plăți recurente folosind acest card, conform autorizării tale.`,
    para2:
      "Aceasta este dovada consimțământului tău explicit pentru plățile inițiate de comerciant (PSD2). Poți retrage autorizarea oricând anulând abonamentul.",
    help: "Întrebări? Scrie-ne la hello@tavli.ro.",
  },
  en: {
    preview: "Confirmation: card on file at Tavli",
    heading: "Card on file — recurring charge confirmation",
    para1: (what: string) =>
      `Your card is now on file for ${what}. When your free trial ends, we'll initiate recurring charges using this card, per your authorisation.`,
    para2:
      "This is the record of your explicit consent for merchant-initiated payments (PSD2). You can withdraw authorisation anytime by cancelling your subscription.",
    help: "Questions? Email hello@tavli.ro.",
  },
  de: {
    preview: "Bestätigung: Karte bei Tavli hinterlegt",
    heading: "Karte hinterlegt — Bestätigung wiederkehrender Zahlungen",
    para1: (what: string) =>
      `Ihre Karte ist nun für ${what} hinterlegt. Nach Ablauf Ihrer kostenlosen Testphase initiieren wir wiederkehrende Abbuchungen mit dieser Karte gemäß Ihrer Autorisierung.`,
    para2:
      "Dies ist der Nachweis Ihrer ausdrücklichen Zustimmung zu händlerinitiierten Zahlungen (PSD2). Sie können die Autorisierung jederzeit durch Kündigung Ihres Abonnements widerrufen.",
    help: "Fragen? Schreiben Sie an hello@tavli.ro.",
  },
} as const;

export function getSubject(locale: Locale): string {
  switch (locale) {
    case "ro":
      return "Card înregistrat la Tavli — confirmare plată recurentă";
    case "en":
      return "Card on file at Tavli — recurring charge confirmation";
    case "de":
      return "Karte bei Tavli hinterlegt — Bestätigung wiederkehrender Zahlungen";
  }
}

export function RecurringChargeConsentEmail({
  locale,
  chargeDescription,
}: RecurringChargeConsentEmailProps) {
  const c = COPY[locale];
  const what = chargeDescription ?? "Tavli";

  return (
    <Html>
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            {c.heading}
          </Heading>
          <Text style={text}>{c.para1(what)}</Text>
          <Hr style={hr} />
          <Text style={muted}>{c.para2}</Text>
          <Text style={muted}>{c.help}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#FAFAF9",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};
const container = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "40px 24px",
  backgroundColor: "#FFFFFF",
  borderRadius: "16px",
};
const logo = {
  color: "#F97316",
  fontSize: "28px",
  fontWeight: 700,
  margin: "0 0 8px",
  fontFamily: "Georgia, 'Times New Roman', serif",
};
const h1 = {
  fontSize: "32px",
  lineHeight: "1.1",
  color: "#1C1917",
  margin: "24px 0 16px",
  fontWeight: 700,
  fontFamily: "Georgia, 'Times New Roman', serif",
};
const text = { fontSize: "16px", lineHeight: "1.6", color: "#1a1a1a", margin: "0 0 16px" };
const muted = { fontSize: "14px", lineHeight: "1.5", color: "#78716C", margin: "0 0 12px" };
const hr = { border: "none", borderTop: "1px solid #E7E5E4", margin: "24px 0 16px" };

export default RecurringChargeConsentEmail;
