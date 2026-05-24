/**
 * §11 — channel vocabulary bridges between the clean `marketing_channel` enum
 * (email|sms|whatsapp|in_confirmation) and the two existing tables that use
 * their own vocabularies:
 *   - `marketing_consents.channel` = '{x}_marketing' (in_confirmation reuses
 *     email_marketing — it's an email promo).
 *   - `marketing_suppressions.channel` = 'email'|'sms'|'whatsapp' (in_confirmation
 *     suppresses as email).
 */
export type MarketingChannel = "email" | "sms" | "whatsapp" | "in_confirmation";

export function marketingConsentChannel(ch: MarketingChannel): string {
  switch (ch) {
    case "email":
    case "in_confirmation":
      return "email_marketing";
    case "sms":
      return "sms_marketing";
    case "whatsapp":
      return "whatsapp_marketing";
  }
}

export function suppressionChannel(ch: MarketingChannel): "email" | "sms" | "whatsapp" {
  switch (ch) {
    case "email":
    case "in_confirmation":
      return "email";
    case "sms":
      return "sms";
    case "whatsapp":
      return "whatsapp";
  }
}
