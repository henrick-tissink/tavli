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
  daysOpen: number;
  partnerInboxUrl: string;
}

const COPY = {
  ro: {
    preview: (d: number) => `Reamintire: cerere fără răspuns de ${d} zile`,
    title: (d: number) => `Reamintire: cerere fără răspuns de ${d} zile`,
    subtitle: (n: string, r: string) =>
      `${n} încă așteaptă un răspuns pentru ${r}.`,
    detailsLabel: "Detalii",
    cta: "Vezi în inbox",
  },
  en: {
    preview: (d: number) => `Reminder: request open for ${d} days`,
    title: (d: number) => `Reminder: request open for ${d} days`,
    subtitle: (n: string, r: string) =>
      `${n} is still waiting for a reply about ${r}.`,
    detailsLabel: "Details",
    cta: "Open inbox",
  },
} as const;

export default function EventRequestNudgeEmail(props: Props) {
  const c = COPY[props.locale];
  return (
    <Html lang={props.locale}>
      <Head />
      <Preview>{c.preview(props.daysOpen)}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px" }}>
          <Heading style={{ fontSize: 24, marginBottom: 4 }}>
            {c.title(props.daysOpen)}
          </Heading>
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
              <strong>{c.detailsLabel}</strong>
            </Text>
            <Text>
              {props.eventDate} · {props.partySize}
            </Text>
          </Section>
          <Section style={{ marginTop: 24 }}>
            <Link
              href={props.partnerInboxUrl}
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
