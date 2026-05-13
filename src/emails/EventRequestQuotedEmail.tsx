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
  amountLei: number;
  quoteExpiresAt: string;
}

const COPY = {
  ro: {
    preview: "Ai primit o ofertă",
    title: "Ai primit o ofertă",
    subtitle: (n: string, r: string) => `Salut, ${n} — ${r} ți-a trimis o ofertă.`,
    amountLabel: "Sumă",
    expiresLabel: "Expiră",
    cta: "Răspunde la ofertă",
    currency: "lei",
  },
  en: {
    preview: "You received a quote",
    title: "You received a quote",
    subtitle: (n: string, r: string) => `Hi, ${n} — ${r} sent you a quote.`,
    amountLabel: "Amount",
    expiresLabel: "Expires",
    cta: "Respond to quote",
    currency: "RON",
  },
} as const;

export default function EventRequestQuotedEmail(props: Props) {
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
              <strong>{c.amountLabel}:</strong> {props.amountLei} {c.currency}
            </Text>
            <Text>
              <strong>{c.expiresLabel}:</strong> {props.quoteExpiresAt}
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
