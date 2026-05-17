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
  partnerInboxUrl: string;
}

const COPY = {
  ro: {
    preview: "Solicitare nouă de eveniment privat",
    title: "Solicitare nouă de eveniment",
    subtitle: (n: string, r: string) => `${n} a trimis o solicitare pentru ${r}`,
    detailsLabel: "Detalii",
    occasion: {
      wedding: "Nuntă",
      birthday: "Aniversare",
      corporate_dinner: "Cină corporate",
      product_launch: "Lansare de produs",
      other: "Altele",
    },
    cta: "Vezi în inbox",
  },
  en: {
    preview: "New private event request",
    title: "New event request",
    subtitle: (n: string, r: string) => `${n} sent a request for ${r}`,
    detailsLabel: "Details",
    occasion: {
      wedding: "Wedding",
      birthday: "Birthday",
      corporate_dinner: "Corporate dinner",
      product_launch: "Product launch",
      other: "Other",
    },
    cta: "Open inbox",
  },
} as const;

export default function EventRequestNewToPartnerEmail(props: Props) {
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
              {c.occasion[props.occasion]} · {props.eventDate} · {props.partySize}
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
