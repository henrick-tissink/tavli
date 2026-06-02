/**
 * Event-request email dispatchers.
 *
 * Thin wrappers over `sendEmail` (Resend) that render the matching
 * `@/emails/EventRequest*Email` template and pick a locale-aware subject
 * from the `emails` catalogue (Batch B — ro/en/de).
 *
 * Callers should `await` these inside a try/catch — a failed transactional
 * email must not break the state transition that triggered it.
 */

import "server-only";
import { sendEmail, type SendEmailResult } from "@/lib/email/resend";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import EventRequestNewToPartnerEmail from "@/emails/EventRequestNewToPartnerEmail";
import EventRequestRepliedEmail from "@/emails/EventRequestRepliedEmail";
import EventRequestQuotedEmail from "@/emails/EventRequestQuotedEmail";
import EventRequestAcceptedEmail from "@/emails/EventRequestAcceptedEmail";
import EventRequestDeclinedEmail from "@/emails/EventRequestDeclinedEmail";
import EventRequestExpiredEmail from "@/emails/EventRequestExpiredEmail";
import EventRequestNudgeEmail from "@/emails/EventRequestNudgeEmail";

export type EventRequestLocale = "ro" | "en" | "de";
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

export async function sendEventRequestNew(
  p: BaseProps & { partnerEmail: string; partnerInboxUrl: string },
): Promise<SendEmailResult> {
  const m = getMessages(p.locale, "emails").eventNew;
  return sendEmail({
    to: p.partnerEmail,
    subject: m.subject,
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
  const m = getMessages(p.locale, "emails").eventReplied;
  return sendEmail({
    to: p.guestEmail,
    subject: interpolate(m.subject, { restaurantName: p.restaurantName }),
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
  const m = getMessages(p.locale, "emails").eventQuoted;
  return sendEmail({
    to: p.guestEmail,
    subject: interpolate(m.subject, { restaurantName: p.restaurantName }),
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
  const m = getMessages(p.locale, "emails").eventAccepted;
  return sendEmail({
    to: p.to,
    subject: interpolate(m.subject, { restaurantName: p.restaurantName }),
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
  const m = getMessages(p.locale, "emails").eventDeclined;
  return sendEmail({
    to: p.to,
    subject: m.subject,
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
  const m = getMessages(p.locale, "emails").eventExpired;
  return sendEmail({
    to: p.guestEmail,
    subject: m.subject,
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
  const m = getMessages(p.locale, "emails").eventNudge;
  return sendEmail({
    to: p.partnerEmail,
    subject: interpolate(m.subject, { daysOpen: p.daysOpen }),
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
