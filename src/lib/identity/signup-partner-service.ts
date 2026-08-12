import "server-only";

/**
 * §01 §5.2 — production wiring for `signupPartner`. Binds the DI'd factory to
 * the real Supabase Auth Admin API, the §12 Stripe trial-start orchestration,
 * audit, and a Resend-backed welcome email. Imported by the `/partner/sign-up`
 * `"use server"` action.
 */
import { render } from "@react-email/render";
import { dbAdmin } from "@/lib/db/admin";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { recordAudit } from "@/lib/audit/record";
import { recordBillingAudit } from "@/lib/billing/billing-audit";
import { enqueue } from "@/lib/jobs/enqueue";
import { getStripe } from "@/lib/stripe/client";
import { makeStartSubscription } from "@/lib/billing/start-subscription";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { appOrigin } from "@/lib/app-origin";
import { PartnerWelcomeEmail, getSubject } from "@/emails/PartnerWelcomeEmail";
import {
  PartnerVerifyEmail,
  getSubject as getVerifySubject,
} from "@/emails/PartnerVerifyEmail";
import { seedTriggeredCampaigns } from "@/lib/marketing/triggered-defaults";
import { makeSignupPartner, type SignupAuthAdmin } from "./signup-partner";

const authAdmin: SignupAuthAdmin = {
  async createUser({ email, password, locale }) {
    const admin = createSupabaseAdminClient();
    // §5.2 step 3 — creates the unverified user AND hands back the
    // confirmation link without sending anything. Supabase's stock template is
    // bypassed entirely; `sendVerifyEmail` delivers our own via Resend.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        data: { locale },
        redirectTo: `${appOrigin()}/auth/callback`,
      },
    });
    const verifyUrl = data?.properties?.action_link;
    if (error || !data?.user || !verifyUrl) {
      throw new Error(error?.message ?? "auth user creation failed");
    }
    return { userId: data.user.id, verifyUrl };
  },
  async deleteUser(userId) {
    const admin = createSupabaseAdminClient();
    await admin.auth.admin.deleteUser(userId);
  },
};

async function sendWelcomeEmail(input: {
  to: string;
  locale: "ro" | "en" | "de";
  fullName: string;
  restaurantName: string;
}) {
  const node = PartnerWelcomeEmail({
    fullName: input.fullName,
    restaurantName: input.restaurantName,
    // /partner/onboarding is not a route — this CTA 404'd. The portal root
    // renders the setup checklist, which is what the copy promises.
    onboardingUrl: `${appOrigin()}/partner`,
    locale: input.locale,
  });
  const html = await render(node);
  const text = await render(node, { plainText: true });
  const res = await sendTransactionalEmail({
    to: input.to,
    locale: input.locale,
    templateKey: "partner_welcome",
    subject: getSubject(input.locale),
    html,
    text,
    context: {},
  });
  // Reports failure rather than throwing; signupPartner treats a throw as
  // best-effort and carries on, which is the behaviour we want — but only if
  // the failure is actually visible.
  if (!res.ok) {
    throw new Error(`transactional send failed: ${res.error ?? "unknown"}`);
  }
}

async function sendVerifyEmail(input: {
  to: string;
  locale: "ro" | "en" | "de";
  fullName: string;
  verifyUrl: string;
}) {
  const node = PartnerVerifyEmail({
    fullName: input.fullName,
    verifyUrl: input.verifyUrl,
    locale: input.locale,
  });
  const html = await render(node);
  const text = await render(node, { plainText: true });
  const res = await sendTransactionalEmail({
    to: input.to,
    locale: input.locale,
    templateKey: "partner_verify",
    subject: getVerifySubject(input.locale),
    html,
    text,
    context: {},
  });
  if (!res.ok) {
    throw new Error(`transactional send failed: ${res.error ?? "unknown"}`);
  }
}

export const signupPartner = makeSignupPartner({
  db: dbAdmin,
  authAdmin,
  // Lazy getStripe(): only reached when a customer_type is captured at signup.
  startSubscription: (input) =>
    makeStartSubscription({ stripe: getStripe(), db: dbAdmin, enqueue, recordBillingAudit })(input),
  recordAudit,
  sendWelcomeEmail,
  sendVerifyEmail,
  seedTriggeredCampaigns: (organizationId, db) =>
    seedTriggeredCampaigns(organizationId, db as Parameters<typeof seedTriggeredCampaigns>[1]),
});
