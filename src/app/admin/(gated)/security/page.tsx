import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  listVerifiedTotpFactors,
  countUnconsumedRecoveryCodes,
} from "@/lib/auth/mfa";
import { TwoFactorSection } from "@/app/partner/(dashboard)/security/_components/TwoFactorSection";
import { RecoveryCodesSection } from "@/app/partner/(dashboard)/security/_components/RecoveryCodesSection";
import { PasswordSection } from "@/app/partner/(dashboard)/security/_components/PasswordSection";
import { SessionsSection } from "@/app/partner/(dashboard)/security/_components/SessionsSection";
import * as adminActions from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ enrol?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  const factors = await listVerifiedTotpFactors(supabase);
  const remaining =
    factors.length > 0 ? await countUnconsumedRecoveryCodes(user.id) : 0;

  const params = await searchParams;
  const enrolRequired = params.enrol === "required";

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">Security</h1>
      </header>

      {enrolRequired && factors.length === 0 && (
        <div
          role="alert"
          className="rounded-button border border-amber-500 bg-amber-50 p-4"
        >
          <p className="font-medium text-text-primary">
            Two-factor authentication is required for admin access.
          </p>
          <p className="text-sm text-text-secondary mt-1">
            Set up an authenticator app to continue.
          </p>
        </div>
      )}

      <TwoFactorSection
        factors={factors.map((f) => ({
          id: f.id,
          friendlyName: f.friendlyName,
          createdAt: f.createdAt,
        }))}
        actions={{ ...adminActions }}
      />

      {factors.length > 0 && (
        <RecoveryCodesSection remaining={remaining} actions={{ ...adminActions }} />
      )}
      <PasswordSection actions={{ ...adminActions }} />
      <SessionsSection actions={{ ...adminActions }} />
    </div>
  );
}
