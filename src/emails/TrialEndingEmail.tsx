/**
 * TrialEndingEmail — §12 §13 trial reminders (day 60 / 75 / 85).
 *
 * Sent by the JOBS.billing.sendReminderDay{60,75,85} handlers. RO/EN/DE copy
 * inline (matches the Wave 3 template pattern). Day-85 copy includes the
 * "we'll auto-charge €X on DD MMM" line; earlier days are gentler nudges.
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
export type TrialReminderDay = 60 | 75 | 85;

export interface TrialEndingEmailProps {
  day: TrialReminderDay;
  trialEndsAt: Date;
  chargeAmount?: string;
  locale: Locale;
}

const COPY = {
  ro: {
    intl: "ro-RO",
    preview: (day: number) => `Ești în ziua ${day} din perioada gratuită Tavli`,
    heading: "Perioada ta gratuită continuă",
    body: (day: number) =>
      `Ești în ziua ${day} din cele 90 de zile gratuite. Nu trebuie să faci nimic acum — îți spunem din timp înainte de prima plată.`,
    charge: (amount: string, when: string) =>
      `Pe ${when} vom încasa automat ${amount} de pe cardul tău, dacă nu anulezi înainte.`,
    soft: "Poți gestiona abonamentul oricând din panoul de facturare.",
    help: "Întrebări? Scrie-ne la hello@tavli.ro.",
  },
  en: {
    intl: "en-GB",
    preview: (day: number) => `You're on day ${day} of your Tavli free trial`,
    heading: "Your free trial is rolling",
    body: (day: number) =>
      `You're on day ${day} of your 90-day free trial. Nothing to do right now — we'll give you plenty of notice before the first charge.`,
    charge: (amount: string, when: string) =>
      `On ${when} we'll automatically charge ${amount} to your card, unless you cancel before then.`,
    soft: "You can manage your subscription anytime from the billing dashboard.",
    help: "Questions? Email hello@tavli.ro.",
  },
  de: {
    intl: "de-DE",
    preview: (day: number) => `Sie sind an Tag ${day} Ihrer kostenlosen Tavli-Testphase`,
    heading: "Ihre kostenlose Testphase läuft",
    body: (day: number) =>
      `Sie sind an Tag ${day} Ihrer 90-tägigen kostenlosen Testphase. Jetzt ist nichts zu tun — wir informieren Sie rechtzeitig vor der ersten Abbuchung.`,
    charge: (amount: string, when: string) =>
      `Am ${when} buchen wir automatisch ${amount} von Ihrer Karte ab, sofern Sie nicht vorher kündigen.`,
    soft: "Sie können Ihr Abonnement jederzeit im Abrechnungsbereich verwalten.",
    help: "Fragen? Schreiben Sie an hello@tavli.ro.",
  },
} as const;

export function getSubject(locale: Locale, props: { day: TrialReminderDay }): string {
  const { day } = props;
  switch (locale) {
    case "ro":
      return day === 85 ? "Prima plată Tavli se apropie" : `Ziua ${day} din perioada gratuită Tavli`;
    case "en":
      return day === 85 ? "Your first Tavli charge is coming up" : `Day ${day} of your Tavli free trial`;
    case "de":
      return day === 85
        ? "Ihre erste Tavli-Abbuchung steht bevor"
        : `Tag ${day} Ihrer kostenlosen Tavli-Testphase`;
  }
}

export function TrialEndingEmail({ day, trialEndsAt, chargeAmount, locale }: TrialEndingEmailProps) {
  const c = COPY[locale];
  const whenFmt = trialEndsAt.toLocaleDateString(c.intl, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const showCharge = day === 85 && chargeAmount;

  return (
    <Html>
      <Head />
      <Preview>{c.preview(day)}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            {c.heading}
          </Heading>
          <Text style={text}>{c.body(day)}</Text>
          {showCharge ? <Text style={text}>{c.charge(chargeAmount as string, whenFmt)}</Text> : null}
          <Hr style={hr} />
          <Text style={muted}>{c.soft}</Text>
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

export default TrialEndingEmail;
