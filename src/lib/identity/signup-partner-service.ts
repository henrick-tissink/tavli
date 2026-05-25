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
import { makeSignupPartner, type SignupAuthAdmin } from "./signup-partner";

const authAdmin: SignupAuthAdmin = {
  async createUser({ email, password, locale }) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      // §5.2 step 3 — unverified; Supabase sends the confirmation email.
      email_confirm: false,
      user_metadata: { locale },
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? "auth user creation failed");
    }
    return { userId: data.user.id };
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
    onboardingUrl: `${appOrigin()}/partner/onboarding`,
    locale: input.locale,
  });
  const html = await render(node);
  const text = await render(node, { plainText: true });
  await sendTransactionalEmail({
    to: input.to,
    locale: input.locale,
    templateKey: "partner_welcome",
    subject: getSubject(input.locale),
    html,
    text,
    context: {},
  });
}

export const signupPartner = makeSignupPartner({
  db: dbAdmin,
  authAdmin,
  // Lazy getStripe(): only reached when a customer_type is captured at signup.
  startSubscription: (input) =>
    makeStartSubscription({ stripe: getStripe(), db: dbAdmin, enqueue, recordBillingAudit })(input),
  recordAudit,
  sendWelcomeEmail,
});
