import { appOrigin } from "@/lib/app-origin";

/** The email-link types we mint. */
export type ConfirmLinkType = "signup" | "magiclink";

/**
 * Build the link that goes in a verification email.
 *
 * Points at our own `/auth/confirm` rather than Supabase's `/auth/v1/verify`,
 * because `admin.generateLink` mints implicit-flow tokens: Supabase's endpoint
 * would redirect to `…#access_token=…`, and a URL fragment never reaches the
 * server. The recipient would be confirmed but not signed in, and would land
 * on the storefront instead of the confirmation screen.
 *
 * `hashed_token` comes back from generateLink alongside `action_link`;
 * `/auth/confirm` feeds it to `verifyOtp`, which writes the session cookies.
 */
export function buildConfirmUrl(hashedToken: string, type: ConfirmLinkType): string {
  const params = new URLSearchParams({ token_hash: hashedToken, type });
  return `${appOrigin()}/auth/confirm?${params.toString()}`;
}
