/**
 * StaffInvitationEmail — §01 §6. Sent when an operator invites someone to their
 * organization (org-level member) or a single venue (venue staff). RO/EN/DE
 * inline, mirroring the SetupCheckinEmail / InvitationEmail house style.
 *
 * The link carries the raw invitation token; the invitee accepts at
 * /invitations/[token]/accept-staff after signing in (the email there must
 * match the invitation).
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
export type InviteKind = "org" | "restaurant";

export interface StaffInvitationEmailProps {
  inviteUrl: string;
  kind: InviteKind;
  role: string;
  expiresAt: Date;
  locale: Locale;
  invitedByName?: string;
}

const ROLE_LABELS: Record<Locale, Record<string, string>> = {
  ro: { owner: "proprietar", admin: "administrator", manager: "manager", host: "gazdă" },
  en: { owner: "owner", admin: "admin", manager: "manager", host: "host" },
  de: { owner: "Inhaber", admin: "Administrator", manager: "Manager", host: "Gastgeber" },
};

function roleLabel(locale: Locale, role: string): string {
  return ROLE_LABELS[locale][role] ?? role;
}

const COPY = {
  ro: {
    locale: "ro-RO",
    preview: "Ai fost invitat în echipa Tavli",
    h1: "Ai fost invitat.",
    lede: (by: string | undefined, scope: string, role: string) =>
      `${by ? `${by} ` : ""}te-a invitat să te alături ${scope} pe Tavli ca ${role}.`,
    scopeOrg: "organizației",
    scopeVenue: "echipei restaurantului",
    body: "Acceptă invitația, conectează-te (sau creează-ți contul) cu adresa la care ai primit acest email și vei avea acces imediat.",
    cta: "Acceptă invitația",
    expires: (d: string) => `Linkul expiră pe ${d}. Dacă nu te așteptai la acest email, îl poți ignora.`,
    footer: "Tavli · rezervări la restaurante.",
  },
  en: {
    locale: "en-GB",
    preview: "You've been invited to a Tavli team",
    h1: "You're invited.",
    lede: (by: string | undefined, scope: string, role: string) =>
      `${by ? `${by} ` : ""}invited you to join ${scope} on Tavli as a ${role}.`,
    scopeOrg: "the organisation",
    scopeVenue: "the venue team",
    body: "Accept the invitation and sign in (or create your account) with the email this was sent to — you'll have access right away.",
    cta: "Accept invitation",
    expires: (d: string) => `This link expires on ${d}. If you weren't expecting this email, you can ignore it.`,
    footer: "Tavli · restaurant reservations.",
  },
  de: {
    locale: "de-DE",
    preview: "Sie wurden zu einem Tavli-Team eingeladen",
    h1: "Sie sind eingeladen.",
    lede: (by: string | undefined, scope: string, role: string) =>
      `${by ? `${by} ` : ""}hat Sie eingeladen, ${scope} auf Tavli als ${role} beizutreten.`,
    scopeOrg: "der Organisation",
    scopeVenue: "dem Restaurant-Team",
    body: "Nehmen Sie die Einladung an und melden Sie sich mit der E-Mail-Adresse an (oder erstellen Sie Ihr Konto), an die diese gesendet wurde — Sie erhalten sofort Zugriff.",
    cta: "Einladung annehmen",
    expires: (d: string) => `Dieser Link läuft am ${d} ab. Falls Sie diese E-Mail nicht erwartet haben, können Sie sie ignorieren.`,
    footer: "Tavli · Restaurantreservierungen.",
  },
} as const;

export function getSubject(locale: Locale, props: { kind: InviteKind }): string {
  switch (locale) {
    case "ro":
      return props.kind === "org" ? "Invitație în organizația ta Tavli" : "Invitație în echipa restaurantului";
    case "en":
      return props.kind === "org" ? "You're invited to a Tavli organisation" : "You're invited to a venue team";
    case "de":
      return props.kind === "org" ? "Einladung zu einer Tavli-Organisation" : "Einladung zu einem Restaurant-Team";
  }
}

export function StaffInvitationEmail({
  inviteUrl,
  kind,
  role,
  expiresAt,
  locale,
  invitedByName,
}: StaffInvitationEmailProps) {
  const c = COPY[locale];
  const scope = kind === "org" ? c.scopeOrg : c.scopeVenue;
  const expiresText = expiresAt.toLocaleDateString(c.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Html>
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>{c.h1}</Heading>
          <Text style={lede}>{c.lede(invitedByName, scope, roleLabel(locale, role))}</Text>
          <Text style={text}>{c.body}</Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button href={inviteUrl} style={button}>{c.cta}</Button>
          </Section>
          <Text style={muted}>{c.expires(expiresText)}</Text>
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
