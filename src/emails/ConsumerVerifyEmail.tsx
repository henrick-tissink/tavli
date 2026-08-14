/**
 * ConsumerVerifyEmail — §01. The diner's email-address confirmation link.
 *
 * Sent by `consumerSignUpAction`, which mints the URL with Supabase
 * `generateLink` and delivers it through Resend, so diners get the same
 * branded, localised treatment as partners instead of Supabase's stock
 * English template.
 *
 * Colours follow the app tokens: #C2410C (brand-primary) for the CTA and the
 * fallback link — white text on it clears WCAG AA at ~5.2:1 — and #F97316
 * (brand-logo-orange) only for the wordmark.
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type Locale = "ro" | "en" | "de";

export interface ConsumerVerifyEmailProps {
  verifyUrl: string;
  locale: Locale;
}

const COPY = {
  ro: {
    preview: "Confirmă-ți adresa de email",
    h1: "Mai e un pas.",
    lede: "Confirmă că această adresă îți aparține și contul tău Tavli e gata.",
    body: "După asta rezervi o masă în câteva secunde și îți găsești toate rezervările într-un singur loc.",
    cta: "Confirmă adresa",
    fallback: "Dacă butonul nu funcționează, copiază acest link în browser:",
    ignore: "Dacă nu ți-ai creat un cont Tavli, poți ignora acest email.",
    footer: "Tavli · rezervări la restaurante.",
  },
  en: {
    preview: "Confirm your email address",
    h1: "One step left.",
    lede: "Confirm that this address belongs to you and your Tavli account is ready.",
    body: "After that you can book a table in seconds and keep every reservation in one place.",
    cta: "Confirm my email",
    fallback: "If the button doesn't work, copy this link into your browser:",
    ignore: "If you didn't create a Tavli account, you can ignore this email.",
    footer: "Tavli · restaurant reservations.",
  },
  de: {
    preview: "Bestätigen Sie Ihre E-Mail-Adresse",
    h1: "Nur noch ein Schritt.",
    lede: "Bestätigen Sie, dass diese Adresse Ihnen gehört — dann ist Ihr Tavli-Konto bereit.",
    body: "Danach reservieren Sie in Sekunden einen Tisch und haben alle Reservierungen an einem Ort.",
    cta: "E-Mail bestätigen",
    fallback:
      "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    ignore:
      "Wenn Sie kein Tavli-Konto erstellt haben, können Sie diese E-Mail ignorieren.",
    footer: "Tavli · Restaurantreservierungen.",
  },
} as const;

export function getSubject(locale: Locale): string {
  switch (locale) {
    case "ro":
      return "Confirmă-ți adresa de email";
    case "en":
      return "Confirm your email address";
    case "de":
      return "Bestätigen Sie Ihre E-Mail-Adresse";
  }
}

export function ConsumerVerifyEmail({ verifyUrl, locale }: ConsumerVerifyEmailProps) {
  const c = COPY[locale];
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>{c.h1}</Heading>
          <Text style={lede}>{c.lede}</Text>
          <Text style={text}>{c.body}</Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button href={verifyUrl} style={button}>{c.cta}</Button>
          </Section>
          <Text style={muted}>{c.fallback}</Text>
          <Link href={verifyUrl} style={fallbackLink}>{verifyUrl}</Link>
          <Text style={muted}>{c.ignore}</Text>
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
  backgroundColor: "#C2410C",
  color: "#FFFFFF",
  padding: "14px 28px",
  borderRadius: "10px",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
};
const muted = { fontSize: "13px", lineHeight: "1.5", color: "#78716C", margin: "24px 0 0" };
const fallbackLink = {
  fontSize: "12px",
  lineHeight: "1.5",
  color: "#C2410C",
  wordBreak: "break-all" as const,
  display: "block",
  margin: "8px 0 0",
};
const hr = { border: "none", borderTop: "1px solid #E7E5E4", margin: "32px 0 16px" };
const footer = { fontSize: "12px", lineHeight: "1.5", color: "#A8A29E", textAlign: "center" as const };
