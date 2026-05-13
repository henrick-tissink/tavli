import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface Props {
  locale: "ro" | "en";
  restaurantName: string;
  occasion: "wedding" | "birthday" | "corporate_dinner" | "product_launch" | "other";
  eventDate: string;
  partySize: number;
  guestName: string;
  trackingUrl: string;
  declineReason: string;
}

const REASONS: Record<string, { ro: string; en: string }> = {
  no_availability: {
    ro: "Indisponibilitate la data solicitată",
    en: "No availability on the requested date",
  },
  out_of_capacity: {
    ro: "Capacitate insuficientă pentru grupul tău",
    en: "Capacity is not sufficient for your group",
  },
  budget_mismatch: {
    ro: "Bugetul nu se potrivește",
    en: "Budget does not match",
  },
  other: {
    ro: "Alt motiv",
    en: "Other reason",
  },
};

const COPY = {
  ro: {
    preview: "Solicitarea a fost refuzată",
    title: "Solicitarea a fost refuzată",
    subtitle: (n: string, r: string) =>
      `Salut, ${n} — ${r} nu poate onora solicitarea ta.`,
    reasonLabel: "Motiv",
    cta: "Caută alt restaurant",
  },
  en: {
    preview: "Your request was declined",
    title: "Your request was declined",
    subtitle: (n: string, r: string) =>
      `Hi, ${n} — ${r} cannot fulfill your request.`,
    reasonLabel: "Reason",
    cta: "Find another venue",
  },
} as const;

export default function EventRequestDeclinedEmail(props: Props) {
  const c = COPY[props.locale];
  const reasonCopy =
    REASONS[props.declineReason]?.[props.locale] ?? props.declineReason;
  return (
    <Html lang={props.locale}>
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px" }}>
          <Heading style={{ fontSize: 24, marginBottom: 4 }}>{c.title}</Heading>
          <Text style={{ color: "#5c5c5c" }}>
            {c.subtitle(props.guestName, props.restaurantName)}
          </Text>
          <Section
            style={{
              background: "white",
              padding: 16,
              borderRadius: 8,
              marginTop: 16,
            }}
          >
            <Text>
              <strong>{c.reasonLabel}</strong>
            </Text>
            <Text>{reasonCopy}</Text>
          </Section>
          <Section style={{ marginTop: 24 }}>
            <Link
              href={props.trackingUrl}
              style={{
                background: "#c0392b",
                color: "white",
                padding: "12px 18px",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              {c.cta}
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
