/**
 * DataDeletionConfirmedEmail — §13 §6.3 step 5.
 *
 * Sent to a diner once the GDPR erasure cascade completes. RO/EN/DE
 * copy embedded inline (matches Wave 3 template pattern — per-locale
 * catalogues stub at src/emails/messages/loader.ts is identity for v1).
 *
 * Wired up by the orchestrator in T14, called via sendTransactionalEmail
 * with templateKey='data_deletion_confirmed'.
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export type Locale = "ro" | "en" | "de";

export interface DataDeletionConfirmedEmailProps {
  dsrId: string;
  completedAt: Date;
  createdAt: Date;
  locale: Locale;
}

const COPY = {
  ro: {
    preview: "Cererea ta de ștergere a datelor este finalizată",
    heading: "Datele tale au fost șterse",
    para1: (created: string) =>
      `Conform cererii tale din ${created}, toate datele tale personale au fost șterse din sistemele Tavli.`,
    para2: (dsrId: string, completed: string) =>
      `Referință: ${dsrId}. Finalizat: ${completed}.`,
    para3:
      "Un număr limitat de înregistrări operaționale (de exemplu, evidențele fiscale cerute de legislația română) sunt păstrate conform legislației aplicabile.",
    para4: "Întrebări? Scrie-ne la legal@tavli.ro.",
    locale: "ro-RO",
  },
  en: {
    preview: "Your data deletion request is complete",
    heading: "Your data has been deleted",
    para1: (created: string) =>
      `Per your request on ${created}, all your personal data has been deleted from Tavli's systems.`,
    para2: (dsrId: string, completed: string) =>
      `Reference: ${dsrId}. Completed: ${completed}.`,
    para3:
      "A small number of operational records (for example, fiscal entries required by Romanian law) are retained under applicable regulation.",
    para4: "Questions? Email legal@tavli.ro.",
    locale: "en-GB",
  },
  de: {
    preview: "Ihre Anfrage zur Datenlöschung ist abgeschlossen",
    heading: "Ihre Daten wurden gelöscht",
    para1: (created: string) =>
      `Gemäß Ihrer Anfrage vom ${created} wurden alle Ihre personenbezogenen Daten aus den Tavli-Systemen gelöscht.`,
    para2: (dsrId: string, completed: string) =>
      `Referenz: ${dsrId}. Abgeschlossen: ${completed}.`,
    para3:
      "Eine begrenzte Anzahl operativer Aufzeichnungen (zum Beispiel steuerlich vorgeschriebene Einträge gemäß rumänischem Recht) wird gemäß geltendem Recht aufbewahrt.",
    para4: "Fragen? Schreiben Sie an legal@tavli.ro.",
    locale: "de-DE",
  },
} as const;

export function getSubject(locale: Locale, _props: { dsrId: string }): string {
  switch (locale) {
    case "ro":
      return "Datele tale au fost șterse din Tavli";
    case "en":
      return "Your data has been deleted from Tavli";
    case "de":
      return "Ihre Daten wurden bei Tavli gelöscht";
  }
}

export function DataDeletionConfirmedEmail({
  dsrId,
  completedAt,
  createdAt,
  locale,
}: DataDeletionConfirmedEmailProps) {
  const c = COPY[locale];
  const createdFmt = createdAt.toLocaleDateString(c.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const completedFmt = completedAt.toLocaleDateString(c.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
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
          <Text style={text}>{c.para1(createdFmt)}</Text>
          <Text style={text}>{c.para2(dsrId, completedFmt)}</Text>
          <Hr style={hr} />
          <Text style={muted}>{c.para3}</Text>
          <Text style={muted}>{c.para4}</Text>
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

const text = {
  fontSize: "16px",
  lineHeight: "1.6",
  color: "#1a1a1a",
  margin: "0 0 16px",
};

const muted = {
  fontSize: "14px",
  lineHeight: "1.5",
  color: "#78716C",
  margin: "0 0 12px",
};

const hr = {
  border: "none",
  borderTop: "1px solid #E7E5E4",
  margin: "24px 0 16px",
};

export default DataDeletionConfirmedEmail;
