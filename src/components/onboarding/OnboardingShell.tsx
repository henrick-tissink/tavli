import Link from "next/link";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { STEPS } from "@/lib/onboarding";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages, buildBundle } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { MessagesProvider } from "@/lib/i18n/messages-provider";

interface Props {
  children: ReactNode;
  currentStepIndex: number;
  token?: string;
}

export async function OnboardingShell({
  children,
  currentStepIndex,
  token,
}: Props) {
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.onboarding");
  const bundle = buildBundle(locale, ["partner.common", "partner.onboarding", "ui"]);
  const stepLabels = m.wizard.shell.steps;
  const percent = ((currentStepIndex + 1) / STEPS.length) * 100;

  return (
    <MessagesProvider locale={locale} bundle={bundle}>
      <div className="min-h-screen bg-surface-bg">
        <header className="bg-surface-white border-b border-border">
          <div className="max-w-2xl mx-auto px-4 desktop:px-6 py-5 flex items-center justify-between">
            <Link
              href={token ? `/onboard/${token}` : "#"}
              className="font-display text-2xl font-bold text-brand-primary tracking-tight"
            >
              Tavli
            </Link>
            <p className="text-xs text-text-muted tracking-[0.2em] uppercase">
              {m.wizard.shell.eyebrow}
            </p>
          </div>
          <div className="max-w-2xl mx-auto px-4 desktop:px-6 pb-5">
            <div className="flex items-center justify-between mb-2 text-xs">
              <span className="font-semibold text-text-primary">
                {interpolate(m.wizard.shell.stepProgress, {
                  current: currentStepIndex + 1,
                  total: STEPS.length,
                })}{" "}
                <span className="text-brand-primary">
                  {stepLabels[STEPS[currentStepIndex]?.key as keyof typeof stepLabels]}
                </span>
              </span>
              <span className="text-text-muted">
                {interpolate(m.wizard.shell.percentComplete, {
                  percent: Math.round(percent),
                })}
              </span>
            </div>
            <div className="flex gap-1.5">
              {STEPS.map((step, i) => {
                const done = i < currentStepIndex;
                const active = i === currentStepIndex;
                const label = stepLabels[step.key];
                return (
                  <div
                    key={step.key}
                    className={`flex-1 h-1.5 rounded-full transition-colors ${
                      done
                        ? "bg-brand-primary"
                        : active
                          ? "bg-brand-primary-soft border border-brand-primary"
                          : "bg-border"
                    }`}
                    aria-label={`${label}${done ? m.wizard.shell.stepDone : active ? m.wizard.shell.stepCurrent : ""}`}
                  />
                );
              })}
            </div>
            <div className="hidden desktop:flex justify-between mt-2 text-[11px] text-text-muted uppercase tracking-wider">
              {STEPS.map((step, i) => (
                <span
                  key={step.key}
                  className={`flex items-center gap-1 ${
                    i <= currentStepIndex ? "text-text-secondary" : ""
                  }`}
                >
                  {i < currentStepIndex && (
                    <Check size={10} className="text-brand-primary" />
                  )}
                  {stepLabels[step.key]}
                </span>
              ))}
            </div>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 desktop:px-6 py-8">
          {children}
        </main>
      </div>
    </MessagesProvider>
  );
}
