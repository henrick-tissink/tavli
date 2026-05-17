/**
 * Event-request email dispatchers.
 *
 * Thin wrappers over `sendEmail` (Resend) that render the matching
 * `@/emails/EventRequest*Email` template and pick a locale-aware subject.
 * Phase 1 is RO-only by default; callers can pass `locale: "en"` for
 * preview/admin tooling.
 *
 * Callers should `await` these inside a try/catch — a failed transactional
 * email must not break the state transition that triggered it.
 */

import "server-only";
import { sendEmail, type SendEmailResult } from "@/lib/email/resend";
import EventRequestNewToPartnerEmail from "@/emails/EventRequestNewToPartnerEmail";
import EventRequestRepliedEmail from "@/emails/EventRequestRepliedEmail";
import EventRequestQuotedEmail from "@/emails/EventRequestQuotedEmail";
import EventRequestAcceptedEmail from "@/emails/EventRequestAcceptedEmail";
import EventRequestDeclinedEmail from "@/emails/EventRequestDeclinedEmail";
import EventRequestExpiredEmail from "@/emails/EventRequestExpiredEmail";
import EventRequestNudgeEmail from "@/emails/EventRequestNudgeEmail";

export type EventRequestLocale = "ro" | "en";
export type EventRequestOccasion =
  | "wedding"
  | "birthday"
  | "corporate_dinner"
  | "product_launch"
  | "other";

interface BaseProps {
  locale: EventRequestLocale;
  restaurantName: string;
  occasion: EventRequestOccasion;
  eventDate: string;
  partySize: number;
  guestName: string;
}

function subject(locale: EventRequestLocale, ro: string, en: string): string {
  return locale === "ro" ? ro : en;
}

export async function sendEventRequestNew(
  p: BaseProps & { partnerEmail: string; partnerInboxUrl: string },
): Promise<SendEmailResult> {
  return sendEmail({
    to: p.partnerEmail,
    subject: subject(
      p.locale,
      "Solicitare nouă de eveniment",
      "New event request",
    ),
    react: EventRequestNewToPartnerEmail({
      locale: p.locale,
      restaurantName: p.restaurantName,
      occasion: p.occasion,
      eventDate: p.eventDate,
      partySize: p.partySize,
      guestName: p.guestName,
      partnerInboxUrl: p.partnerInboxUrl,
    }),
  });
}

export async function sendEventRequestReplied(
  p: BaseProps & {
    guestEmail: string;
    trackingUrl: string;
    partnerResponse: string;
  },
): Promise<SendEmailResult> {
  return sendEmail({
    to: p.guestEmail,
    subject: subject(
      p.locale,
      `Răspuns de la ${p.restaurantName}`,
      `Reply from ${p.restaurantName}`,
    ),
    react: EventRequestRepliedEmail({
      locale: p.locale,
      restaurantName: p.restaurantName,
      occasion: p.occasion,
      eventDate: p.eventDate,
      partySize: p.partySize,
      guestName: p.guestName,
      trackingUrl: p.trackingUrl,
      partnerResponse: p.partnerResponse,
    }),
  });
}

export async function sendEventRequestQuoted(
  p: BaseProps & {
    guestEmail: string;
    trackingUrl: string;
    amountLei: number;
    quoteExpiresAt: string;
  },
): Promise<SendEmailResult> {
  return sendEmail({
    to: p.guestEmail,
    subject: subject(
      p.locale,
      `Ofertă pentru evenimentul tău la ${p.restaurantName}`,
      `Quote for your event at ${p.restaurantName}`,
    ),
    react: EventRequestQuotedEmail({
      locale: p.locale,
      restaurantName: p.restaurantName,
      occasion: p.occasion,
      eventDate: p.eventDate,
      partySize: p.partySize,
      guestName: p.guestName,
      trackingUrl: p.trackingUrl,
      amountLei: p.amountLei,
      quoteExpiresAt: p.quoteExpiresAt,
    }),
  });
}

export async function sendEventRequestAccepted(
  p: BaseProps & {
    to: string;
    trackingUrl: string;
    amountLei: number;
  },
): Promise<SendEmailResult> {
  return sendEmail({
    to: p.to,
    subject: subject(
      p.locale,
      `Eveniment confirmat la ${p.restaurantName}`,
      `Event confirmed at ${p.restaurantName}`,
    ),
    react: EventRequestAcceptedEmail({
      locale: p.locale,
      restaurantName: p.restaurantName,
      occasion: p.occasion,
      eventDate: p.eventDate,
      partySize: p.partySize,
      guestName: p.guestName,
      trackingUrl: p.trackingUrl,
      amountLei: p.amountLei,
    }),
  });
}

export async function sendEventRequestDeclined(
  p: BaseProps & {
    to: string;
    trackingUrl: string;
    declineReason: string;
  },
): Promise<SendEmailResult> {
  return sendEmail({
    to: p.to,
    subject: subject(
      p.locale,
      "Solicitarea ta a fost refuzată",
      "Your request was declined",
    ),
    react: EventRequestDeclinedEmail({
      locale: p.locale,
      restaurantName: p.restaurantName,
      occasion: p.occasion,
      eventDate: p.eventDate,
      partySize: p.partySize,
      guestName: p.guestName,
      trackingUrl: p.trackingUrl,
      declineReason: p.declineReason,
    }),
  });
}

export async function sendEventRequestExpired(
  p: BaseProps & {
    guestEmail: string;
    trackingUrl: string;
  },
): Promise<SendEmailResult> {
  return sendEmail({
    to: p.guestEmail,
    subject: subject(
      p.locale,
      "Solicitarea ta a expirat",
      "Your request expired",
    ),
    react: EventRequestExpiredEmail({
      locale: p.locale,
      restaurantName: p.restaurantName,
      occasion: p.occasion,
      eventDate: p.eventDate,
      partySize: p.partySize,
      guestName: p.guestName,
      trackingUrl: p.trackingUrl,
    }),
  });
}

export async function sendEventRequestNudge(
  p: BaseProps & {
    partnerEmail: string;
    trackingUrl: string;
    daysOpen: number;
    partnerInboxUrl: string;
  },
): Promise<SendEmailResult> {
  return sendEmail({
    to: p.partnerEmail,
    subject: subject(
      p.locale,
      `Reamintire: cerere fără răspuns de ${p.daysOpen} zile`,
      `Reminder: request open for ${p.daysOpen} days`,
    ),
    react: EventRequestNudgeEmail({
      locale: p.locale,
      restaurantName: p.restaurantName,
      occasion: p.occasion,
      eventDate: p.eventDate,
      partySize: p.partySize,
      guestName: p.guestName,
      trackingUrl: p.trackingUrl,
      daysOpen: p.daysOpen,
      partnerInboxUrl: p.partnerInboxUrl,
    }),
  });
}
