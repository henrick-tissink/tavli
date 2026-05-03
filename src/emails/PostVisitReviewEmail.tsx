import {
  Body,
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

interface Props {
  restaurantName: string;
  guestName: string;
  reviewBaseUrl: string; // e.g. https://tavli.ro/reviews/<token>
}

function firstNameOf(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0];
}

export function PostVisitReviewEmail({
  restaurantName,
  guestName,
  reviewBaseUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>How was {restaurantName}? One tap to rate.</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            How was {restaurantName}?
          </Heading>
          <Text style={lede}>
            Hi {firstNameOf(guestName)} — one tap is all we need. Your rating
            stays anonymous (first name only) and helps the next diner.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Link
                key={n}
                href={`${reviewBaseUrl}?rating=${n}`}
                style={star}
              >
                {"★".repeat(n)}
              </Link>
            ))}
          </Section>
          <Text style={textMuted}>
            Tap a star above. You&apos;ll land on a page where you can add a
            comment if you want — or just submit and you&apos;re done.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            Tavli — reservations across Romania and Turkey.
          </Text>
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
  fontSize: "30px",
  lineHeight: "1.15",
  color: "#1C1917",
  margin: "20px 0 12px",
  fontWeight: 700,
  fontFamily: "Georgia, 'Times New Roman', serif",
};
const lede = {
  fontSize: "16px",
  lineHeight: "1.55",
  color: "#44403C",
  margin: "0 0 8px",
};
const textMuted = {
  fontSize: "13px",
  lineHeight: "1.55",
  color: "#78716C",
  margin: "8px 0 0",
};
const star = {
  display: "inline-block",
  margin: "0 4px",
  padding: "12px 14px",
  backgroundColor: "#FFF7ED",
  border: "1px solid #FED7AA",
  borderRadius: "10px",
  color: "#F97316",
  fontSize: "20px",
  textDecoration: "none",
  fontWeight: 700,
};
const hr = { border: "none", borderTop: "1px solid #E7E5E4", margin: "24px 0 12px" };
const footer = { fontSize: "12px", color: "#A8A29E", textAlign: "center" as const };
