"use client";

import { useT } from "@/lib/i18n/messages-provider";

export function ReviewPolicyDisclosure() {
  const t = useT("partner.onboarding");
  return (
    <aside className="rounded-card border border-border bg-surface-bg p-4 mt-6 text-sm text-text-secondary">
      <p className="font-semibold text-text-primary mb-1">
        {t("wizard.policyDisclosure.title")}
      </p>
      <p>{t("wizard.policyDisclosure.body")}</p>
    </aside>
  );
}
