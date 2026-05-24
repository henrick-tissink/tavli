/**
 * SetupCheckinEmail — §14 §9. Day-7/30/60 onboarding check-ins. RO/EN/DE inline.
 */
import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";

export type Locale = "ro" | "en" | "de";
export type CheckinDay = 7 | 30 | 60;

export interface SetupCheckinEmailProps {
  day: CheckinDay;
  restaurantName: string;
  locale: Locale;
}

const COPY = {
  ro: {
    preview: (d: number) => `Cum merge configurarea Tavli? (ziua ${d})`,
    heading: "Cum merge?",
    body: (d: number, n: string) =>
      `Ești în ziua ${d} a perioadei de configurare pentru ${n}. Suntem aici dacă ai nevoie de ceva — răspunde la acest email oricând.`,
    help: "Echipa Tavli · hello@tavli.ro",
  },
  en: {
    preview: (d: number) => `How's your Tavli setup going? (day ${d})`,
    heading: "How's it going?",
    body: (d: number, n: string) =>
      `You're on day ${d} of setting up ${n}. We're here if you need anything — just reply to this email.`,
    help: "The Tavli team · hello@tavli.ro",
  },
  de: {
    preview: (d: number) => `Wie läuft Ihre Tavli-Einrichtung? (Tag ${d})`,
    heading: "Wie läuft es?",
    body: (d: number, n: string) =>
      `Sie sind an Tag ${d} der Einrichtung von ${n}. Wir sind für Sie da — antworten Sie einfach auf diese E-Mail.`,
    help: "Das Tavli-Team · hello@tavli.ro",
  },
} as const;

export function getSubject(locale: Locale, props: { day: CheckinDay; restaurantName: string }): string {
  switch (locale) {
    case "ro":
      return `Cum merge configurarea — ${props.restaurantName}?`;
    case "en":
      return `How's setup going at ${props.restaurantName}?`;
    case "de":
      return `Wie läuft die Einrichtung bei ${props.restaurantName}?`;
  }
}

export function SetupCheckinEmail({ day, restaurantName, locale }: SetupCheckinEmailProps) {
  const c = COPY[locale];
  return (
    <Html>
      <Head />
      <Preview>{c.preview(day)}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>{c.heading}</Heading>
          <Text style={text}>{c.body(day, restaurantName)}</Text>
          <Hr style={hr} />
          <Text style={muted}>{c.help}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: "#FAFAF9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" };
const container = { maxWidth: "560px", margin: "0 auto", padding: "40px 24px", backgroundColor: "#FFFFFF", borderRadius: "16px" };
const logo = { color: "#F97316", fontSize: "28px", fontWeight: 700, margin: "0 0 8px", fontFamily: "Georgia, 'Times New Roman', serif" };
const h1 = { fontSize: "30px", lineHeight: "1.12", color: "#1C1917", margin: "16px 0 12px", fontWeight: 700, fontFamily: "Georgia, 'Times New Roman', serif" };
const text = { fontSize: "16px", lineHeight: "1.6", color: "#1a1a1a", margin: "0 0 16px" };
const muted = { fontSize: "14px", lineHeight: "1.5", color: "#78716C", margin: "0" };
const hr = { border: "none", borderTop: "1px solid #E7E5E4", margin: "24px 0 16px" };

export default SetupCheckinEmail;
