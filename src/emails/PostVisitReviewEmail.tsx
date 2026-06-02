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
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { type Locale } from "@/lib/i18n/locale";

interface Props {
  restaurantName: string;
  guestName: string;
  reviewBaseUrl: string; // e.g. https://tavli.ro/reviews/<token>
  locale?: Locale;
}

function firstNameOf(fullName: string): string | null {
  const t = fullName.trim();
  if (!t) return null;
  return t.split(/\s+/)[0];
}

export function PostVisitReviewEmail({
  restaurantName,
  guestName,
  reviewBaseUrl,
  locale = "ro",
}: Props) {
  const m = getMessages(locale, "emails").postVisit;
  const firstName = firstNameOf(guestName);
  const ledeCopy = firstName
    ? interpolate(m.lede, { firstName })
    : m.greetingNoName;

  return (
    <Html>
      <Head />
      <Preview>{m.preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            {interpolate(m.heading, { restaurantName })}
          </Heading>
          <Text style={lede}>
            {ledeCopy}
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Link
                key={n}
                href={`${reviewBaseUrl}?rating=${n}`}
                style={star}
              >
                {n} ★
              </Link>
            ))}
          </Section>
          <Text style={textMuted}>
            {m.instructionText}
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            {m.footer}
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
