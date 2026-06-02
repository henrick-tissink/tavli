"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { invalid, fail, type ActionResult } from "@/lib/server-action";
import { enforceRateLimit } from "@/lib/rate-limit/enforce";
import { signupPartner } from "@/lib/identity/signup-partner-service";

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Parola trebuie să aibă cel puțin 8 caractere."), // i18n-allow
  fullName: z.string().trim().min(1),
  restaurantName: z.string().trim().min(1),
  cityId: z.string().uuid(),
  organizationName: z.string().trim().optional(),
  countryCode: z.string().trim().length(2).default("RO"),
  taxId: z.string().trim().optional(),
  customerType: z.enum(["business", "personal"]).optional(),
  tier: z.enum(["base", "pro"]),
  frequency: z.enum(["monthly", "annual"]),
  termsAccepted: z.literal(true, { message: "Trebuie să accepți termenii." }), // i18n-allow
});

export type SignupActionResult = ActionResult<never>;

export async function signupPartnerAction(
  _prev: SignupActionResult | undefined,
  formData: FormData,
): Promise<SignupActionResult> {
  // §5.2 — signup is a can() exception (no prior session). Compensating
  // controls: per-IP rate limit + Supabase signup limits.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  if (ip) {
    const rl = await enforceRateLimit({ key: `partner-signup:${ip}`, scope: "partner_signup_per_ip" });
    if (!rl.allowed) return fail("rate_limited", "Prea multe încercări. Încearcă din nou mai târziu."); // i18n-allow
  }

  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
    restaurantName: formData.get("restaurantName"),
    cityId: formData.get("cityId"),
    organizationName: formData.get("organizationName") || undefined,
    countryCode: formData.get("countryCode") || "RO",
    taxId: formData.get("taxId") || undefined,
    customerType: formData.get("customerType") || undefined,
    tier: formData.get("tier"),
    frequency: formData.get("frequency"),
    termsAccepted: formData.get("termsAccepted") === "on",
  });
  if (!parsed.success) return invalid(parsed.error);

  const res = await signupPartner({ ...parsed.data, termsAccepted: true });
  if (!res.ok) return res;

  // No session yet (admin-created user). Send them to verify their email.
  redirect("/partner/verify-email?sent=1");
}
