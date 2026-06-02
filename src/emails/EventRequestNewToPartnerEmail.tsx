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
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { type Locale } from "@/lib/i18n/locale";

interface Props {
  locale: Locale;
  restaurantName: string;
  occasion: "wedding" | "birthday" | "corporate_dinner" | "product_launch" | "other";
  eventDate: string;
  partySize: number;
  guestName: string;
  partnerInboxUrl: string;
}

export default function EventRequestNewToPartnerEmail(props: Props) {
  const m = getMessages(props.locale, "emails").eventNew;
  const occasionLabel = {
    wedding: m.occasionWedding,
    birthday: m.occasionBirthday,
    corporate_dinner: m.occasionCorporateDinner,
    product_launch: m.occasionProductLaunch,
    other: m.occasionOther,
  }[props.occasion];

  return (
    <Html lang={props.locale}>
      <Head />
      <Preview>{m.preview}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px" }}>
          <Heading style={{ fontSize: 24, marginBottom: 4 }}>{m.title}</Heading>
          <Text style={{ color: "#5c5c5c" }}>
            {interpolate(m.subtitle, {
              guestName: props.guestName,
              restaurantName: props.restaurantName,
            })}
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
              <strong>{m.detailsLabel}</strong>
            </Text>
            <Text>
              {occasionLabel} · {props.eventDate} · {props.partySize}
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
              {m.cta}
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
