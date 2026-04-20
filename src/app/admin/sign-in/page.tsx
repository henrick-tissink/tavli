import Link from "next/link";
import { SignInForm } from "@/components/admin/SignInForm";

export default function AdminSignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-md bg-surface-white rounded-card border border-border p-8 shadow-card">
        <div className="mb-6">
          <Link
            href="/admin"
            className="font-display text-3xl font-bold text-brand-primary tracking-tight"
          >
            Tavli
          </Link>
          <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
            Admin
          </p>
          <h1 className="font-display text-[28px] font-bold text-text-primary mt-6">
            Sign in
          </h1>
        </div>
        <SignInForm />
      </div>
    </div>
  );
}
