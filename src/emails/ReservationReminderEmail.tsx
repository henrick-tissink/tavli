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
import { getMessages } from "@/lib/i18n/messages";
import { translate, interpolate } from "@/lib/i18n/t";
import { type Locale, BCP47 } from "@/lib/i18n/locale";

interface Props {
  restaurantName: string;
  restaurantAddress?: string;
  reservationDate: string; // YYYY-MM-DD
  reservationTime: string; // HH:MM
  partySize: number;
  guestName: string;
  zone?: string;
  cancelUrl: string;
  locale?: Locale;
}

/**
 * §02 §6 / §04 — the 24-hour pre-arrival reminder. Supports RO/EN/DE.
 * Includes the cancel link so a guest who can't make it can free the table.
 */
export function ReservationReminderEmail({
  restaurantName,
  restaurantAddress,
  reservationDate,
  reservationTime,
  partySize,
  guestName,
  zone,
  cancelUrl,
  locale = "ro",
}: Props) {
  const m = getMessages(locale, "emails").reminder;
  const prettyDate = new Date(`${reservationDate}T12:00:00`).toLocaleDateString(
    BCP47[locale],
    { weekday: "long", day: "numeric", month: "long" },
  );
  const guestsLabel = translate(locale, m.guests, { count: partySize });

  return (
    <Html>
      <Head />
      <Preview>
        {interpolate(m.preview, { restaurantName, prettyDate, time: reservationTime })}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            {m.heading}
          </Heading>
          <Text style={lede}>
            {interpolate(m.lede, { guestName })}
          </Text>
          <Section style={card}>
            <Heading as="h2" style={h2}>
              {restaurantName}
            </Heading>
            <Text style={cardLine}>
              <strong>{prettyDate}</strong>
              {" "}
              {locale === "ro" ? "la" : locale === "de" ? "um" : "at"}
              {" "}
              <strong>{reservationTime}</strong>
            </Text>
            <Text style={cardLine}>
              {partySize} {guestsLabel}
              {zone ? ` · ${zone}` : ""}
            </Text>
            {restaurantAddress && (
              <Text style={cardLineMuted}>{restaurantAddress}</Text>
            )}
          </Section>
          <Text style={lede}>
            {m.cancelHint}
          </Text>
          <Button href={cancelUrl} style={button}>
            {m.manageButton}
          </Button>
          <Hr style={hr} />
          <Text style={footer}>
            {m.footer}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: "#FAFAF9", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" };
const container = { margin: "0 auto", padding: "32px 24px", maxWidth: "480px" };
const logo = { fontFamily: "Georgia,serif", fontSize: "22px", color: "#9A3412", margin: "0 0 24px" };
const h1 = { fontFamily: "Georgia,serif", fontSize: "26px", color: "#1C1917", margin: "0 0 8px" };
const h2 = { fontSize: "18px", color: "#1C1917", margin: "0 0 8px" };
const lede = { fontSize: "15px", color: "#44403C", lineHeight: "1.6", margin: "0 0 16px" };
const card = { backgroundColor: "#FFFFFF", border: "1px solid #E7E5E4", borderRadius: "12px", padding: "20px", margin: "0 0 8px" };
const cardLine = { fontSize: "15px", color: "#1C1917", margin: "0 0 4px" };
const cardLineMuted = { fontSize: "14px", color: "#78716C", margin: "8px 0 0" };
const button = { backgroundColor: "#C2410C", color: "#FFFFFF", fontWeight: 700, fontSize: "15px", borderRadius: "10px", padding: "12px 24px", textDecoration: "none", display: "inline-block", marginTop: "8px" };
const hr = { borderColor: "#E7E5E4", margin: "28px 0 16px" };
const footer = { fontSize: "12px", color: "#A8A29E", margin: "0" };
