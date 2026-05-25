import {
  Body,
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
  guestName: string;
  restaurantName: string;
  reason: string;
}

const REASON_RO: Record<string, string> = {
  spam: "conținut considerat spam",
  inappropriate: "limbaj nepotrivit sau ofensator",
  fake: "recenzie suspectată ca falsă / neautentică",
  harassment: "hărțuire sau atac la persoană",
  gdpr_takedown: "o cerere legală (date cu caracter personal)",
  other: "încălcarea regulilor comunității",
};

/**
 * §06 §5.3 / DSA Art 17 — statement of reasons sent to a review's author when
 * the review is removed on an upheld report. States the ground for removal and
 * the right to contest. RO copy (matches the other single-locale templates).
 */
export function ReviewRemovedStatementEmail({ guestName, restaurantName, reason }: Props) {
  const reasonText = REASON_RO[reason] ?? "încălcarea regulilor comunității";
  return (
    <Html>
      <Head />
      <Preview>Recenzia ta pentru {restaurantName} a fost retrasă</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            Recenzia ta a fost retrasă.
          </Heading>
          <Text style={lede}>
            Salut, {guestName} — recenzia ta pentru <strong>{restaurantName}</strong>{" "}
            nu mai este afișată public.
          </Text>
          <Section style={card}>
            <Text style={cardLine}>
              <strong>Motivul:</strong> {reasonText}.
            </Text>
          </Section>
          <Text style={lede}>
            Crezi că este o eroare? Poți contesta această decizie scriindu-ne la{" "}
            <a href="mailto:contestatii@tavli.ro" style={link}>contestatii@tavli.ro</a>,
            în temeiul Regulamentului UE privind serviciile digitale (DSA, art. 17).
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Tavli — moderare transparentă a recenziilor.</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: "#FAFAF9", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" };
const container = { margin: "0 auto", padding: "32px 24px", maxWidth: "480px" };
const logo = { fontFamily: "Georgia,serif", fontSize: "22px", color: "#9A3412", margin: "0 0 24px" };
const h1 = { fontFamily: "Georgia,serif", fontSize: "24px", color: "#1C1917", margin: "0 0 8px" };
const lede = { fontSize: "15px", color: "#44403C", lineHeight: "1.6", margin: "0 0 16px" };
const card = { backgroundColor: "#FFFFFF", border: "1px solid #E7E5E4", borderRadius: "12px", padding: "16px 20px", margin: "0 0 16px" };
const cardLine = { fontSize: "15px", color: "#1C1917", margin: "0" };
const link = { color: "#C2410C" };
const hr = { borderColor: "#E7E5E4", margin: "28px 0 16px" };
const footer = { fontSize: "12px", color: "#A8A29E", margin: "0" };
