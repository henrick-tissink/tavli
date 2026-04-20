import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface Props {
  restaurantName: string;
  reservationDate: string; // YYYY-MM-DD
  reservationTime: string; // HH:MM
  partySize: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  zone?: string;
  notes?: string;
}

export function PartnerBookingAlertEmail({
  restaurantName,
  reservationDate,
  reservationTime,
  partySize,
  guestName,
  guestPhone,
  guestEmail,
  zone,
  notes,
}: Props) {
  const pretty = new Date(`${reservationDate}T12:00:00`).toLocaleDateString(
    "en-GB",
    { weekday: "short", day: "numeric", month: "short" },
  );

  return (
    <Html>
      <Head />
      <Preview>{`New booking at ${restaurantName} — ${pretty} ${reservationTime} · ${partySize} covers`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            New booking — {restaurantName}
          </Heading>
          <Section style={card}>
            <Text style={{ ...cardLine, fontSize: "17px", fontWeight: 700 }}>
              {pretty} · {reservationTime} · {partySize} covers
            </Text>
            <Hr style={thin} />
            <Text style={cardLine}>
              <strong>{guestName}</strong>
            </Text>
            <Text style={cardLine}>{guestPhone}</Text>
            {guestEmail && <Text style={cardLineMuted}>{guestEmail}</Text>}
            {zone && <Text style={cardLineMuted}>Zone: {zone}</Text>}
            {notes && <Text style={cardLineMuted}>Notes: {notes}</Text>}
          </Section>
          <Text style={text}>
            Manage this booking in your partner dashboard (cancel / mark
            seated / mark no-show).
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Tavli — partner alerts.</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#FAFAF9",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};
const container = {
  maxWidth: "520px",
  margin: "0 auto",
  padding: "36px 24px",
  backgroundColor: "#FFFFFF",
  borderRadius: "16px",
};
const logo = {
  color: "#F97316",
  fontSize: "24px",
  fontWeight: 700,
  margin: "0",
  fontFamily: "Georgia, serif",
};
const h1 = {
  fontSize: "24px",
  color: "#1C1917",
  margin: "16px 0 16px",
  fontWeight: 700,
  fontFamily: "Georgia, serif",
};
const text = { fontSize: "13px", color: "#57534E", margin: "12px 0" };
const card = {
  padding: "16px 18px",
  borderRadius: "12px",
  backgroundColor: "#FAFAF9",
  border: "1px solid #E7E5E4",
};
const cardLine = { fontSize: "14px", color: "#1C1917", margin: "6px 0" };
const cardLineMuted = { fontSize: "12px", color: "#78716C", margin: "4px 0" };
const thin = { border: "none", borderTop: "1px solid #E7E5E4", margin: "10px 0" };
const hr = { border: "none", borderTop: "1px solid #E7E5E4", margin: "24px 0 10px" };
const footer = { fontSize: "11px", color: "#A8A29E", textAlign: "center" as const };
