import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  listVerifiedTotpFactors,
  countUnconsumedRecoveryCodes,
} from "@/lib/auth/mfa";
import { TwoFactorSection } from "./_components/TwoFactorSection";
import { RecoveryCodesSection } from "./_components/RecoveryCodesSection";
import { PasswordSection } from "./_components/PasswordSection";
import { SessionsSection } from "./_components/SessionsSection";

export const dynamic = "force-dynamic";

export default async function PartnerSecurityPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/partner/sign-in");

  const factors = await listVerifiedTotpFactors(supabase);
  const remaining =
    factors.length > 0 ? await countUnconsumedRecoveryCodes(user.id) : 0;

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-12">
      <header>
        <p className="text-xs text-text-muted tracking-[0.2em] uppercase">
          Account
        </p>
        <h1 className="font-display text-4xl mt-2 text-text-primary">Security</h1>
      </header>

      <TwoFactorSection
        factors={factors.map((f) => ({
          id: f.id,
          friendlyName: f.friendlyName,
          createdAt: f.createdAt,
        }))}
      />

      {factors.length > 0 && <RecoveryCodesSection remaining={remaining} />}
      <PasswordSection />
      <SessionsSection />
    </div>
  );
}
