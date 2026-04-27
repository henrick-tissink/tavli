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
import { getSiteUrl } from "@/lib/site-url";

interface Props {
  restaurantName: string;
  restaurantCitySlug: string;
  restaurantSlug: string;
  reservationDate: string; // YYYY-MM-DD
  reservationTime: string; // HH:MM
  partySize: number;
  guestName: string;
  guestMessage: string;
}

export function PartnerCancelledEmail({
  restaurantName,
  restaurantCitySlug,
  restaurantSlug,
  reservationDate,
  reservationTime,
  partySize,
  guestName,
  guestMessage,
}: Props) {
  const prettyDate = new Date(`${reservationDate}T12:00:00`).toLocaleDateString(
    "en-GB",
    { weekday: "long", day: "numeric", month: "long" },
  );
  const rebookUrl = `${getSiteUrl()}/${restaurantCitySlug}/${restaurantSlug}`;

  return (
    <Html>
      <Head />
      <Preview>
        Reservation cancelled at {restaurantName} — {prettyDate} at {reservationTime}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            Reservation cancelled.
          </Heading>
          <Text style={lede}>
            Hi {guestName} — unfortunately your reservation at{" "}
            <strong>{restaurantName}</strong> for <strong>{prettyDate}</strong>{" "}
            at <strong>{reservationTime}</strong> (party of {partySize}) has
            been cancelled.
          </Text>
          <Section style={card}>
            <Text style={cardLine}>
              <em>{guestMessage}</em>
            </Text>
          </Section>
          <Text style={text}>
            We&apos;re sorry for the inconvenience. You&apos;re welcome to
            rebook anytime.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button href={rebookUrl} style={cta}>
              Find another time
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
const lede = {
  fontSize: "16px",
  lineHeight: "1.55",
  color: "#44403C",
  margin: "0 0 16px",
};
const text = {
  fontSize: "14px",
  lineHeight: "1.6",
  color: "#57534E",
  margin: "0 0 12px",
};
const card = {
  margin: "20px 0",
  padding: "20px",
  borderRadius: "12px",
  backgroundColor: "#FFF7ED",
  borderLeft: "4px solid #F97316",
};
const cardLine = {
  fontSize: "15px",
  color: "#1C1917",
  margin: "0",
};
const cta = {
  backgroundColor: "#F97316",
  color: "#FFFFFF",
  padding: "12px 24px",
  borderRadius: "10px",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
};
const hr = {
  border: "none",
  borderTop: "1px solid #E7E5E4",
  margin: "24px 0 12px",
};
const footer = {
  fontSize: "12px",
  color: "#A8A29E",
  textAlign: "center" as const,
};
