import "server-only";

/**
 * §01 §5.2 — `signupPartner`, the atomic operator self-serve sign-up.
 *
 * Coordinates a Drizzle transaction with two external systems (Supabase Auth
 * Admin + Stripe via §12 startSubscription). Auth-user creation (step 3) and
 * the Stripe handoff (step 9) sit OUTSIDE the Drizzle tx; failure handling:
 *
 *  - tx (steps 4–8) fails → it rolls back; the auth user created in step 3 is
 *    hard-deleted (compensation) so the email can re-signup.
 *  - Stripe handoff (step 9) fails → the account exists and is usable; the org
 *    stays `pending_verification` and billing is completed later via the
 *    onboarding "Complete setup" CTA (we surface `billingDeferred`).
 *
 * This action is a `can()` exception: the user is creating their identity, so
 * there is no prior session to authorize against. Rate-limiting / Turnstile /
 * Supabase signup limits are the compensating controls (wired at the surface).
 *
 * Factory-only export (DI for db / auth admin / startSubscription / audit /
 * email / clock / slug) so the orchestration is unit-testable without Supabase
 * or Stripe.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  profiles,
  organizations,
  restaurants,
  organizationMembers,
  restaurantStaff,
  subscriptions,
} from "@/lib/db/schema";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { ok, fail, type ActionResult } from "@/lib/server-action";

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  restaurantName: string;
  cityId: string;
  organizationName?: string;
  countryCode?: string;
  taxId?: string | null;
  /** Optional at signup; billing is deferred until the operator supplies it. */
  customerType?: "business" | "personal" | null;
  tier: "base" | "pro";
  frequency: "monthly" | "annual";
  termsAccepted: boolean;
  locale?: "ro" | "en" | "de";
}

export interface SignupSuccess {
  userId: string;
  organizationId: string;
  restaurantId: string;
  /** Stripe Checkout (setup-mode) URL for card-on-file; null when deferred. */
  stripeCheckoutUrl: string | null;
  billingDeferred: boolean;
}

export interface SignupAuthAdmin {
  /** Create an unverified auth user (sends the verification email). */
  createUser(input: { email: string; password: string; locale: string }): Promise<{ userId: string }>;
  /** Compensation — hard-delete the auth user when the tx rolls back. */
  deleteUser(userId: string): Promise<void>;
}

export interface SignupPartnerDeps {
  db: typeof dbAdmin;
  authAdmin: SignupAuthAdmin;
  startSubscription: (input: {
    organizationId: string;
    tier: "base" | "pro";
    frequency: "monthly" | "annual";
  }) => Promise<{ stripeCheckoutUrl: string }>;
  recordAudit: typeof defaultRecordAudit;
  sendWelcomeEmail: (input: {
    to: string;
    locale: "ro" | "en" | "de";
    fullName: string;
    restaurantName: string;
  }) => Promise<unknown>;
  now?: () => Date;
  genSlugSuffix?: () => string;
}

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

export function makeSignupPartner(deps: SignupPartnerDeps) {
  const genSlugSuffix =
    deps.genSlugSuffix ?? (() => Math.random().toString(36).slice(2, 8));

  return async function signupPartner(input: SignupInput): Promise<ActionResult<SignupSuccess>> {
    // §5.2 step 1 — essential guards (the surface does full Zod first).
    if (!input.termsAccepted) return fail("invalid_input", "Terms must be accepted.");
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RX.test(email)) return fail("invalid_input", "Invalid email.");
    if (input.password.length < 8) return fail("invalid_input", "Password too short.");
    if (!input.fullName.trim()) return fail("invalid_input", "Name is required.");
    if (!input.restaurantName.trim()) return fail("invalid_input", "Restaurant name is required.");
    if (!input.cityId) return fail("invalid_input", "City is required.");

    const countryCode = (input.countryCode ?? "RO").toUpperCase();
    const taxId = input.taxId?.trim() ? input.taxId.trim() : null;
    const customerType = input.customerType ?? null;
    const locale = input.locale ?? "ro";

    // §5.2 step 2 — one trial per legal entity (only checkable once a tax_id is
    // supplied; orgs without one can still sign up and supply it before billing).
    if (taxId) {
      const prior = await deps.db
        .select({ id: subscriptions.id })
        .from(organizations)
        .innerJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
        .where(
          and(
            eq(organizations.countryCode, countryCode),
            eq(organizations.taxId, taxId),
            isNotNull(subscriptions.trialStartedAt),
          ),
        );
      if (prior[0]) return fail("TV1401", "A trial has already been used for this tax ID.");
    }

    // §5.2 step 3 — create the auth user (outside the Drizzle tx).
    let userId: string;
    try {
      ({ userId } = await deps.authAdmin.createUser({ email, password: input.password, locale }));
    } catch (err) {
      // Most commonly: email already registered.
      return fail("conflict", (err as Error)?.message ?? "Could not create the account.");
    }

    // §5.2 steps 4–8 — the Drizzle transaction. On any failure, roll back AND
    // compensate by deleting the orphan auth user.
    let organizationId: string;
    let restaurantId: string;
    try {
      const result = await deps.db.transaction(async (tx) => {
        await tx.insert(profiles).values({
          id: userId,
          role: "restaurant_owner",
          fullName: input.fullName.trim(),
          email,
          locale,
        });

        const [org] = await tx
          .insert(organizations)
          .values({
            name: (input.organizationName?.trim() || input.restaurantName.trim()).slice(0, 200),
            countryCode,
            taxId,
            customerType,
            primaryContactEmail: email,
            locale,
            status: "pending_verification",
          })
          .returning({ id: organizations.id });

        const [venue] = await tx
          .insert(restaurants)
          .values({
            slug: `${slugify(input.restaurantName) || "restaurant"}-${genSlugSuffix()}`,
            name: input.restaurantName.trim(),
            cityId: input.cityId,
            organizationId: org.id,
            status: "draft",
          })
          .returning({ id: restaurants.id });

        await tx.insert(organizationMembers).values({
          organizationId: org.id,
          userId,
          role: "owner",
          isActive: true,
        });

        await tx
          .update(profiles)
          .set({ defaultOrganizationId: org.id })
          .where(eq(profiles.id, userId));

        await tx.insert(restaurantStaff).values({
          restaurantId: venue.id,
          userId,
          role: "owner",
          isActive: true,
        });

        return { organizationId: org.id, restaurantId: venue.id };
      });
      organizationId = result.organizationId;
      restaurantId = result.restaurantId;
    } catch (err) {
      // Compensation: the orphan auth user would block re-signup.
      try {
        await deps.authAdmin.deleteUser(userId);
      } catch {
        /* best-effort */
      }
      // TOCTOU on (country_code, tax_id) — the unique index caught the race.
      if (isUniqueViolation(err)) {
        return fail("TV1403", "This tax ID has already been claimed by another organisation.");
      }
      return fail("internal", "Could not create the account. Please try again.");
    }

    // Audit the identity creation (best-effort; never blocks the signup result).
    try {
      await deps.recordAudit({
        action: AUDIT.organization.created,
        subjectType: "organization",
        subjectId: organizationId,
        actorUserId: userId,
        actorRole: "org_owner",
        organizationId,
        context: { country_code: countryCode, tier: input.tier, frequency: input.frequency },
      });
      await deps.recordAudit({
        action: AUDIT.restaurant.created,
        subjectType: "restaurant",
        subjectId: restaurantId,
        actorUserId: userId,
        actorRole: "venue_owner",
        organizationId,
        restaurantId,
        context: { source: "signup" },
      });
    } catch {
      /* best-effort */
    }

    // §5.2 step 9 — Stripe handoff (outside the tx). Requires customer_type;
    // when it's not yet supplied, defer billing to the onboarding flow.
    let stripeCheckoutUrl: string | null = null;
    let billingDeferred = true;
    if (customerType) {
      try {
        const res = await deps.startSubscription({
          organizationId,
          tier: input.tier,
          frequency: input.frequency,
        });
        stripeCheckoutUrl = res.stripeCheckoutUrl;
        billingDeferred = false;
      } catch {
        // Account is usable; billing completed later. Stays pending_verification.
        billingDeferred = true;
      }
    }

    // §5.2 step 11 — welcome email (best-effort).
    try {
      await deps.sendWelcomeEmail({
        to: email,
        locale,
        fullName: input.fullName.trim(),
        restaurantName: input.restaurantName.trim(),
      });
    } catch {
      /* best-effort */
    }

    return ok({ userId, organizationId, restaurantId, stripeCheckoutUrl, billingDeferred });
  };
}
