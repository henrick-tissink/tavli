import Link from "next/link";
import { MailCheck } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { ResendVerification } from "./ResendVerification";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Promise<{ sent?: string }>;
}) {
  const params = (await searchParams) ?? {};
  // If a session exists (e.g. the gate redirected here), prefill the email.
  const session = await getCurrentSession();
  const defaultEmail = session?.userEmail ?? session?.profile.email ?? undefined;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-lg bg-surface-white rounded-card border border-border p-8 shadow-card">
        <p className="font-display text-2xl font-bold text-brand-primary tracking-tight">Tavli</p>
        <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary-soft">
          <MailCheck size={22} className="text-brand-primary" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-2xl text-text-primary">Confirmă-ți adresa de email</h1>
        <p className="mt-2 text-sm text-text-secondary">
          {params.sent === "1"
            ? "Ți-am trimis un link de confirmare. Deschide-l pentru a-ți activa contul, apoi conectează-te."
            : "Contul tău are nevoie de confirmarea adresei de email. Verifică-ți inboxul pentru linkul de confirmare."}
        </p>

        <ResendVerification defaultEmail={defaultEmail} />

        <p className="mt-6 text-sm text-text-secondary">
          Ai confirmat deja?{" "}
          <Link href="/partner/sign-in" className="font-semibold text-brand-primary hover:underline">
            Conectează-te
          </Link>
        </p>
      </div>
    </div>
  );
}
