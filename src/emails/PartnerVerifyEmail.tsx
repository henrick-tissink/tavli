/**
 * PartnerVerifyEmail — §01 §5.2/§5.3. The email-address confirmation link,
 * sent at sign-up and again from the "resend" action. RO/EN/DE inline,
 * mirroring the house email style.
 *
 * Tavli sends this itself (Supabase `generateLink` produces the URL, Resend
 * delivers it) rather than letting Supabase mail its stock template, so the
 * copy is localised, branded, and lives in version control.
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

export interface PartnerVerifyEmailProps {
  /** Omitted on the resend path, where there is no sign-up context. */
  fullName?: string;
  verifyUrl: string;
  locale: Locale;
}

const COPY = {
  ro: {
    preview: "Confirmă-ți adresa de email",
    h1: "Confirmă-ți adresa de email.",
    lede: (name?: string) =>
      name
        ? `Salut, ${name}! A mai rămas un pas: confirmă că această adresă îți aparține.`
        : "A mai rămas un pas: confirmă că această adresă îți aparține.",
    body: "Apasă butonul de mai jos și contul tău Tavli devine activ.",
    cta: "Confirmă adresa",
    fallback: "Dacă butonul nu funcționează, copiază acest link în browser:",
    expired:
      "Dacă linkul nu mai funcționează, poți cere unul nou din pagina de confirmare.",
    ignore: "Dacă nu ți-ai creat un cont Tavli, poți ignora acest email.",
    footer: "Tavli · rezervări la restaurante.",
  },
  en: {
    preview: "Confirm your email address",
    h1: "Confirm your email address.",
    lede: (name?: string) =>
      name
        ? `Hi ${name}! One step left — confirm that this address belongs to you.`
        : "One step left — confirm that this address belongs to you.",
    body: "Press the button below and your Tavli account becomes active.",
    cta: "Confirm my email",
    fallback: "If the button doesn't work, copy this link into your browser:",
    expired:
      "If the link no longer works, you can request a new one from the confirmation page.",
    ignore: "If you didn't create a Tavli account, you can ignore this email.",
    footer: "Tavli · restaurant reservations.",
  },
  de: {
    preview: "Bestätigen Sie Ihre E-Mail-Adresse",
    h1: "Bestätigen Sie Ihre E-Mail-Adresse.",
    lede: (name?: string) =>
      name
        ? `Hallo ${name}! Nur noch ein Schritt — bestätigen Sie, dass diese Adresse Ihnen gehört.`
        : "Nur noch ein Schritt — bestätigen Sie, dass diese Adresse Ihnen gehört.",
    body: "Klicken Sie auf die Schaltfläche unten, und Ihr Tavli-Konto wird aktiv.",
    cta: "E-Mail bestätigen",
    fallback:
      "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    expired:
      "Falls der Link nicht mehr funktioniert, können Sie auf der Bestätigungsseite einen neuen anfordern.",
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

export function PartnerVerifyEmail({
  fullName,
  verifyUrl,
  locale,
}: PartnerVerifyEmailProps) {
  const c = COPY[locale];
  return (
    <Html>
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>{c.h1}</Heading>
          <Text style={lede}>{c.lede(fullName)}</Text>
          <Text style={text}>{c.body}</Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button href={verifyUrl} style={button}>{c.cta}</Button>
          </Section>
          <Text style={muted}>{c.fallback}</Text>
          <Link href={verifyUrl} style={fallbackLink}>{verifyUrl}</Link>
          <Text style={muted}>{c.expired}</Text>
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
