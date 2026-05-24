/**
 * ExportReadyEmail — §07 §8.1 step 8. Sent by the analytics.run-export job when
 * a CSV/ZIP export is ready. RO/EN/DE copy inline (matches the Wave 3/5 template
 * pattern). Carries a 24h signed download link + the list of included tables.
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export type Locale = "ro" | "en" | "de";

export interface ExportReadyEmailProps {
  downloadUrl: string;
  expiresAt: Date;
  tables: string[];
  locale: Locale;
}

const COPY = {
  ro: {
    intl: "ro-RO",
    preview: "Exportul tău Tavli este gata de descărcat",
    heading: "Exportul tău este gata",
    body: "Fișierul cu datele cerute este pregatit. Apasă butonul de mai jos pentru a-l descărca.",
    button: "Descarcă exportul",
    tables: (list: string) => `Tabele incluse: ${list}.`,
    expiry: (when: string) => `Linkul expiră pe ${when}. După această dată va trebui să generezi un export nou.`,
    help: "Întrebări? Scrie-ne la hello@tavli.ro.",
  },
  en: {
    intl: "en-GB",
    preview: "Your Tavli export is ready to download",
    heading: "Your export is ready",
    body: "The file with the data you requested is ready. Use the button below to download it.",
    button: "Download export",
    tables: (list: string) => `Tables included: ${list}.`,
    expiry: (when: string) => `The link expires on ${when}. After that you'll need to generate a fresh export.`,
    help: "Questions? Email hello@tavli.ro.",
  },
  de: {
    intl: "de-DE",
    preview: "Ihr Tavli-Export steht zum Download bereit",
    heading: "Ihr Export ist fertig",
    body: "Die Datei mit den angeforderten Daten ist bereit. Über die Schaltfläche unten können Sie sie herunterladen.",
    button: "Export herunterladen",
    tables: (list: string) => `Enthaltene Tabellen: ${list}.`,
    expiry: (when: string) => `Der Link läuft am ${when} ab. Danach müssen Sie einen neuen Export erstellen.`,
    help: "Fragen? Schreiben Sie an hello@tavli.ro.",
  },
} as const;

export function getSubject(locale: Locale): string {
  switch (locale) {
    case "ro":
      return "Exportul tău Tavli este gata";
    case "en":
      return "Your Tavli export is ready";
    case "de":
      return "Ihr Tavli-Export ist fertig";
  }
}

export function ExportReadyEmail({ downloadUrl, expiresAt, tables, locale }: ExportReadyEmailProps) {
  const c = COPY[locale];
  const whenFmt = expiresAt.toLocaleDateString(c.intl, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Html>
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            {c.heading}
          </Heading>
          <Text style={text}>{c.body}</Text>
          <Button href={downloadUrl} style={button}>
            {c.button}
          </Button>
          <Text style={muted}>{c.tables(tables.join(", "))}</Text>
          <Hr style={hr} />
          <Text style={muted}>{c.expiry(whenFmt)}</Text>
          <Text style={muted}>{c.help}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#FAFAF9",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
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
const text = { fontSize: "16px", lineHeight: "1.6", color: "#1a1a1a", margin: "0 0 16px" };
const button = {
  backgroundColor: "#F97316",
  color: "#FFFFFF",
  fontSize: "16px",
  fontWeight: 600,
  borderRadius: "10px",
  padding: "12px 24px",
  textDecoration: "none",
  display: "inline-block",
};
const muted = { fontSize: "14px", lineHeight: "1.5", color: "#78716C", margin: "16px 0 0" };
const hr = { border: "none", borderTop: "1px solid #E7E5E4", margin: "24px 0 16px" };

export default ExportReadyEmail;
