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

interface Props {
  inviteUrl: string;
  cityName?: string;
  proposedName?: string;
  invitedByName?: string;
  expiresAt: Date;
}

export function InvitationEmail({
  inviteUrl,
  cityName,
  proposedName,
  invitedByName,
  expiresAt,
}: Props) {
  const expiresText = expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Html>
      <Head />
      <Preview>
        You&apos;re invited to list{" "}
        {proposedName ?? "your restaurant"} on Tavli
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            You&apos;re invited.
          </Heading>
          <Text style={lede}>
            {invitedByName ? `${invitedByName} at ` : ""}
            Tavli would like to add{" "}
            {proposedName ? <strong>{proposedName}</strong> : "your restaurant"}{" "}
            to the reservations platform
            {cityName ? ` in ${cityName}` : ""}.
          </Text>
          <Text style={text}>
            Set up your profile, hours, photos, and menu in about 10 minutes.
            You stay in control of availability and can edit anything later.
          </Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button href={inviteUrl} style={button}>
              Start onboarding
            </Button>
          </Section>
          <Text style={muted}>
            This link expires on {expiresText}. If you didn&apos;t expect this
            email, you can ignore it — nothing will happen without you clicking
            the button.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            Tavli · restaurant reservations across Romania and Turkey.
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
  fontSize: "32px",
  lineHeight: "1.1",
  color: "#1C1917",
  margin: "24px 0 16px",
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
  margin: "0 0 16px",
};

const button = {
  backgroundColor: "#F97316",
  color: "#FFFFFF",
  padding: "14px 28px",
  borderRadius: "10px",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
};

const muted = {
  fontSize: "13px",
  lineHeight: "1.5",
  color: "#78716C",
  margin: "24px 0 0",
};

const hr = {
  border: "none",
  borderTop: "1px solid #E7E5E4",
  margin: "32px 0 16px",
};

const footer = {
  fontSize: "12px",
  lineHeight: "1.5",
  color: "#A8A29E",
  textAlign: "center" as const,
};
