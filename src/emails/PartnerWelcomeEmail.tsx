/**
 * PartnerWelcomeEmail — §01 §5.2 step 11. Sent after a successful operator
 * sign-up. RO/EN/DE inline, mirroring the house email style.
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type Locale = "ro" | "en" | "de";

export interface PartnerWelcomeEmailProps {
  fullName: string;
  restaurantName: string;
  onboardingUrl: string;
  locale: Locale;
}

const COPY = {
  ro: {
    preview: "Bun venit pe Tavli",
    h1: "Bun venit pe Tavli.",
    lede: (name: string, venue: string) =>
      `Salut, ${name}! Contul pentru ${venue} este creat. Perioada ta de probă de 3 luni a început.`,
    body: "Continuă configurarea — adaugă fotografii, meniul și programul de disponibilitate. Îți ia câteva minute și poți reveni oricând.",
    cta: "Continuă configurarea",
    verify: "Nu uita să confirmi adresa de email — ți-am trimis un link separat.",
    footer: "Tavli · rezervări la restaurante.",
  },
  en: {
    preview: "Welcome to Tavli",
    h1: "Welcome to Tavli.",
    lede: (name: string, venue: string) =>
      `Hi ${name}! Your account for ${venue} is set up. Your 3-month trial has started.`,
    body: "Continue your setup — add photos, your menu, and availability. It takes a few minutes, and you can come back anytime.",
    cta: "Continue setup",
    verify: "Don't forget to confirm your email — we sent a separate verification link.",
    footer: "Tavli · restaurant reservations.",
  },
  de: {
    preview: "Willkommen bei Tavli",
    h1: "Willkommen bei Tavli.",
    lede: (name: string, venue: string) =>
      `Hallo ${name}! Ihr Konto für ${venue} ist eingerichtet. Ihre 3-monatige Testphase hat begonnen.`,
    body: "Setzen Sie die Einrichtung fort — fügen Sie Fotos, Ihre Speisekarte und Verfügbarkeiten hinzu. Es dauert nur wenige Minuten, und Sie können jederzeit zurückkehren.",
    cta: "Einrichtung fortsetzen",
    verify: "Vergessen Sie nicht, Ihre E-Mail zu bestätigen — wir haben einen separaten Bestätigungslink gesendet.",
    footer: "Tavli · Restaurantreservierungen.",
  },
} as const;

export function getSubject(locale: Locale): string {
  switch (locale) {
    case "ro":
      return "Bun venit pe Tavli";
    case "en":
      return "Welcome to Tavli";
    case "de":
      return "Willkommen bei Tavli";
  }
}

export function PartnerWelcomeEmail({
  fullName,
  restaurantName,
  onboardingUrl,
  locale,
}: PartnerWelcomeEmailProps) {
  const c = COPY[locale];
  return (
    <Html>
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>{c.h1}</Heading>
          <Text style={lede}>{c.lede(fullName, restaurantName)}</Text>
          <Text style={text}>{c.body}</Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button href={onboardingUrl} style={button}>{c.cta}</Button>
          </Section>
          <Text style={muted}>{c.verify}</Text>
          <Hr style={hr} />
          <Text style={footer}>{c.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#FAFAF9",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
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
const lede = { fontSize: "16px", lineHeight: "1.55", color: "#44403C", margin: "0 0 16px" };
const text = { fontSize: "14px", lineHeight: "1.6", color: "#57534E", margin: "0 0 16px" };
const button = {
  backgroundColor: "#F97316",
  color: "#FFFFFF",
  padding: "14px 28px",
  borderRadius: "10px",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
};
const muted = { fontSize: "13px", lineHeight: "1.5", color: "#78716C", margin: "24px 0 0" };
const hr = { border: "none", borderTop: "1px solid #E7E5E4", margin: "32px 0 16px" };
const footer = { fontSize: "12px", lineHeight: "1.5", color: "#A8A29E", textAlign: "center" as const };
