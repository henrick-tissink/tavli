/**
 * WeeklySummaryEmail — §07 §9. Sent Sunday nights by analytics.weekly-summary.
 * RO/EN/DE copy inline. Headline week metrics + WoW deltas + reviews; a Pro
 * section (top source + next-week forecast) renders only for Pro orgs.
 */
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Column,
  Text,
} from "@react-email/components";

export type Locale = "ro" | "en" | "de";

export interface WeeklySummaryMetrics {
  bookings: number;
  covers: number;
  completed: number;
  noShows: number;
  cancellations: number;
  bookingsDelta: number; // WoW absolute delta
  coversDelta: number;
}

export interface WeeklySummaryEmailProps {
  restaurantName: string;
  weekStart: Date;
  weekEnd: Date;
  metrics: WeeklySummaryMetrics;
  reviews: { count: number; avgRating: number | null };
  tier: "base" | "pro";
  pro?: { topSource?: string | null; forecastCovers?: number | null };
  locale: Locale;
}

const COPY = {
  ro: {
    intl: "ro-RO",
    preview: (n: string) => `Săptămâna ta la ${n}`,
    heading: "Săptămâna ta pe scurt",
    range: (a: string, b: string) => `${a} – ${b}`,
    bookings: "Rezervări",
    covers: "Acoperiri",
    completed: "Finalizate",
    noShows: "Neprezentări",
    cancellations: "Anulări",
    reviews: (c: number, r: string) => `${c} recenzii noi · notă medie ${r}`,
    proTopSource: (s: string) => `Cea mai bună sursă de trafic: ${s}`,
    proForecast: (n: number) => `Estimare pentru săptămâna viitoare: ${n} acoperiri`,
    help: "Vezi detaliile complete în panoul Tavli.",
  },
  en: {
    intl: "en-GB",
    preview: (n: string) => `Your week at ${n}`,
    heading: "Your week at a glance",
    range: (a: string, b: string) => `${a} – ${b}`,
    bookings: "Bookings",
    covers: "Covers",
    completed: "Completed",
    noShows: "No-shows",
    cancellations: "Cancellations",
    reviews: (c: number, r: string) => `${c} new reviews · avg rating ${r}`,
    proTopSource: (s: string) => `Top traffic source: ${s}`,
    proForecast: (n: number) => `Next week's forecast: ${n} covers`,
    help: "See the full breakdown in your Tavli dashboard.",
  },
  de: {
    intl: "de-DE",
    preview: (n: string) => `Ihre Woche bei ${n}`,
    heading: "Ihre Woche auf einen Blick",
    range: (a: string, b: string) => `${a} – ${b}`,
    bookings: "Buchungen",
    covers: "Gedecke",
    completed: "Abgeschlossen",
    noShows: "No-Shows",
    cancellations: "Stornierungen",
    reviews: (c: number, r: string) => `${c} neue Bewertungen · Ø-Bewertung ${r}`,
    proTopSource: (s: string) => `Top-Traffic-Quelle: ${s}`,
    proForecast: (n: number) => `Prognose für nächste Woche: ${n} Gedecke`,
    help: "Die vollständige Übersicht finden Sie in Ihrem Tavli-Dashboard.",
  },
} as const;

export function getSubject(locale: Locale, props: { restaurantName: string }): string {
  switch (locale) {
    case "ro":
      return `Tavli — săptămâna ta la ${props.restaurantName}`;
    case "en":
      return `Tavli — your week at ${props.restaurantName}`;
    case "de":
      return `Tavli — Ihre Woche bei ${props.restaurantName}`;
  }
}

function arrow(delta: number): string {
  if (delta > 0) return `▲ +${delta}`;
  if (delta < 0) return `▼ ${delta}`;
  return "–";
}

export function WeeklySummaryEmail(props: WeeklySummaryEmailProps) {
  const { restaurantName, weekStart, weekEnd, metrics, reviews, tier, pro, locale } = props;
  const c = COPY[locale];
  const fmt = (d: Date) => d.toLocaleDateString(c.intl, { day: "numeric", month: "short" });
  const showPro = tier === "pro" && pro;

  return (
    <Html>
      <Head />
      <Preview>{c.preview(restaurantName)}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={logo}>Tavli</Heading>
          <Heading as="h1" style={h1}>
            {c.heading}
          </Heading>
          <Text style={muted}>
            {restaurantName} · {c.range(fmt(weekStart), fmt(weekEnd))}
          </Text>

          <Row>
            <Column style={cell}>
              <Text style={metricLabel}>{c.bookings}</Text>
              <Text style={metricValue}>{metrics.bookings}</Text>
              <Text style={deltaText}>{arrow(metrics.bookingsDelta)}</Text>
            </Column>
            <Column style={cell}>
              <Text style={metricLabel}>{c.covers}</Text>
              <Text style={metricValue}>{metrics.covers}</Text>
              <Text style={deltaText}>{arrow(metrics.coversDelta)}</Text>
            </Column>
          </Row>
          <Row>
            <Column style={cell}>
              <Text style={metricLabel}>{c.completed}</Text>
              <Text style={metricValue}>{metrics.completed}</Text>
            </Column>
            <Column style={cell}>
              <Text style={metricLabel}>{c.noShows}</Text>
              <Text style={metricValue}>{metrics.noShows}</Text>
            </Column>
            <Column style={cell}>
              <Text style={metricLabel}>{c.cancellations}</Text>
              <Text style={metricValue}>{metrics.cancellations}</Text>
            </Column>
          </Row>

          <Hr style={hr} />
          <Text style={text}>
            {c.reviews(reviews.count, reviews.avgRating != null ? reviews.avgRating.toFixed(1) : "—")}
          </Text>

          {showPro ? (
            <>
              <Hr style={hr} />
              {pro?.topSource ? <Text style={text}>{c.proTopSource(pro.topSource)}</Text> : null}
              {pro?.forecastCovers != null ? <Text style={text}>{c.proForecast(pro.forecastCovers)}</Text> : null}
            </>
          ) : null}

          <Hr style={hr} />
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
  fontSize: "28px",
  lineHeight: "1.15",
  color: "#1C1917",
  margin: "16px 0 8px",
  fontWeight: 700,
  fontFamily: "Georgia, 'Times New Roman', serif",
};
const text = { fontSize: "16px", lineHeight: "1.6", color: "#1a1a1a", margin: "0 0 12px" };
const muted = { fontSize: "14px", lineHeight: "1.5", color: "#78716C", margin: "0 0 16px" };
const cell = { padding: "8px 12px", textAlign: "center" as const };
const metricLabel = { fontSize: "12px", color: "#78716C", margin: "0 0 4px", textTransform: "uppercase" as const };
const metricValue = { fontSize: "26px", fontWeight: 700, color: "#1C1917", margin: "0" };
const deltaText = { fontSize: "13px", color: "#78716C", margin: "2px 0 0" };
const hr = { border: "none", borderTop: "1px solid #E7E5E4", margin: "20px 0" };

export default WeeklySummaryEmail;
