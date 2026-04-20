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

interface Props {
  restaurantName: string;
  restaurantAddress?: string;
  reservationDate: string; // YYYY-MM-DD
  reservationTime: string; // HH:MM
  partySize: number;
  guestName: string;
  zone?: string;
  cancelUrl: string;
}

export function ReservationConfirmationEmail({
  restaurantName,
  restaurantAddress,
  reservationDate,
  reservationTime,
  partySize,
  guestName,
  zone,
  cancelUrl,
}: Props) {
  const prettyDate = new Date(`${reservationDate}T12:00:00`).toLocaleDateString(
    "en-GB",
    { weekday: "long", day: "numeric", month: "long" },
  );

  return (
    <Html>
      <Head />
      <Preview>
        Table booked at {restaurantName} — {prettyDate} at {reservationTime}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            You&apos;re booked.
          </Heading>
          <Text style={lede}>
            Hi {guestName} — here are your reservation details.
          </Text>
          <Section style={card}>
            <Heading as="h2" style={h2}>
              {restaurantName}
            </Heading>
            <Text style={cardLine}>
              <strong>{prettyDate}</strong> at <strong>{reservationTime}</strong>
            </Text>
            <Text style={cardLine}>
              Party of {partySize}
              {zone ? ` · ${zone}` : ""}
            </Text>
            {restaurantAddress && (
              <Text style={cardLineMuted}>{restaurantAddress}</Text>
            )}
          </Section>
          <Text style={text}>
            Please arrive a few minutes early and let the host know you
            reserved through Tavli.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button href={cancelUrl} style={cancelButton}>
              Cancel or modify
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>Tavli — reservations across Romania and Turkey.</Text>
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
  margin: "24px 0 12px",
  fontWeight: 700,
  fontFamily: "Georgia, 'Times New Roman', serif",
};
const h2 = {
  fontSize: "20px",
  lineHeight: "1.2",
  color: "#1C1917",
  margin: "0 0 8px",
  fontWeight: 700,
  fontFamily: "Georgia, 'Times New Roman', serif",
};
const lede = { fontSize: "16px", lineHeight: "1.55", color: "#44403C", margin: "0 0 16px" };
const text = { fontSize: "14px", lineHeight: "1.6", color: "#57534E", margin: "0 0 12px" };
const card = {
  margin: "20px 0",
  padding: "20px",
  borderRadius: "12px",
  backgroundColor: "#FFF7ED",
  borderLeft: "4px solid #F97316",
};
const cardLine = { fontSize: "15px", color: "#1C1917", margin: "4px 0" };
const cardLineMuted = { fontSize: "13px", color: "#78716C", margin: "8px 0 0" };
const cancelButton = {
  backgroundColor: "#FFFFFF",
  color: "#57534E",
  padding: "12px 24px",
  borderRadius: "10px",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  border: "1px solid #E7E5E4",
};
const hr = { border: "none", borderTop: "1px solid #E7E5E4", margin: "24px 0 12px" };
const footer = { fontSize: "12px", color: "#A8A29E", textAlign: "center" as const };
