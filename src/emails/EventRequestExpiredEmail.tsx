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
}

const COPY = {
  ro: {
    preview: "Solicitarea a expirat",
    title: "Solicitarea a expirat",
    subtitle: (n: string, r: string) =>
      `Salut, ${n} — solicitarea ta pentru ${r} a expirat fără răspuns.`,
    detailsLabel: "Detalii",
    cta: "Trimite o nouă solicitare",
  },
  en: {
    preview: "Your request expired",
    title: "Your request expired",
    subtitle: (n: string, r: string) =>
      `Hi, ${n} — your request for ${r} expired without a reply.`,
    detailsLabel: "Details",
    cta: "Submit a new request",
  },
} as const;

export default function EventRequestExpiredEmail(props: Props) {
  const c = COPY[props.locale];
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
              <strong>{c.detailsLabel}</strong>
            </Text>
            <Text>
              {props.eventDate} · {props.partySize}
            </Text>
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
