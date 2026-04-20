import Link from "next/link";
import { PartnerSignInForm } from "@/components/partner/PartnerSignInForm";

export const dynamic = "force-dynamic";

export default function PartnerSignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-md bg-surface-white rounded-card border border-border p-8 shadow-card">
        <div className="mb-6">
          <Link
            href="/partner"
            className="font-display text-3xl font-bold text-brand-primary tracking-tight"
          >
            Tavli
          </Link>
          <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
            Partner
          </p>
          <h1 className="font-display text-[28px] font-bold text-text-primary mt-6">
            Sign in
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Access your restaurant dashboard.
          </p>
        </div>
        <PartnerSignInForm />
      </div>
    </div>
  );
}
