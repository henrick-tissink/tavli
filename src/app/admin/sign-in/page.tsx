import Image from "next/image";
import Link from "next/link";
import { SignInForm } from "@/components/admin/SignInForm";

export default function AdminSignInPage() {
  return (
    <div className="min-h-screen flex flex-col desktop:flex-row">
      {/* Left panel — desktop only */}
      <div className="hidden desktop:flex desktop:w-1/2 bg-gradient-to-br from-brand-primary-soft via-white to-white p-12 items-center justify-center">
        <div className="flex flex-col items-center max-w-md w-full">
          <div className="self-start">
            <Link
              href="/admin"
              className="font-display text-3xl font-bold text-brand-primary tracking-tight"
            >
              Tavli
            </Link>
            <p className="text-xs text-text-muted tracking-[0.2em] uppercase mt-1">
              Admin
            </p>
          </div>
          <Image
            src="/illustrations/auth-partner.svg"
            alt=""
            width={280}
            height={280}
            className="mt-8 text-brand-primary"
            aria-hidden="true"
          />
          <h2 className="font-display text-2xl font-bold text-text-primary mt-6 self-start">
            Panoul de administrare Tavli.
          </h2>
          <p className="text-sm text-text-secondary mt-2 self-start">
            Acces restricționat. Operatori autorizați.
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 bg-surface-bg">
        <div className="w-full max-w-md bg-surface-white rounded-card border border-border p-10 shadow-card">
          {/* Mobile wordmark — hidden on desktop */}
          <div className="flex items-center justify-center mb-6 desktop:hidden">
            <div className="w-12 h-12 rounded-full bg-brand-primary-soft flex items-center justify-center">
              <Link
                href="/admin"
                className="font-display text-xl font-bold text-brand-primary tracking-tight"
              >
                T
              </Link>
            </div>
          </div>
          <div className="mb-6">
            <h1 className="font-display text-[28px] font-bold text-text-primary">
              Acces administrator
            </h1>
          </div>
          <SignInForm />
        </div>
      </div>
    </div>
  );
}
