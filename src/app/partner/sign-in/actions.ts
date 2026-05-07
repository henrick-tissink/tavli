"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";

export interface PartnerSignInResult {
  ok: boolean;
  error?: string;
}

export async function signInPartner(
  _prev: PartnerSignInResult | undefined,
  formData: FormData,
): Promise<PartnerSignInResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { ok: false, error: "Supabase nu este încă configurat." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, error: "Emailul și parola sunt obligatorii." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Conectarea a eșuat." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile?.role !== "restaurant_owner" && profile?.role !== "admin") {
    await supabase.auth.signOut();
    return { ok: false, error: "Acest cont nu este un cont de partener." };
  }

  redirect("/partner");
}

export async function signOutPartner(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    redirect("/partner/sign-in");
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/partner/sign-in");
}
