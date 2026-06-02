"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/button";
import { Pill } from "@/components/pill";
import { toast } from "@/components/toast";
import { cuisineLabel } from "@/lib/types";
import { useT } from "@/lib/i18n/messages-provider";
import {
  savePartnerProfile,
  type SaveProfileResult,
} from "@/app/(app)/partner/(dashboard)/profile/actions";

interface Props {
  initialValues: {
    name?: string | null;
    cuisines?: string[] | null;
    address?: string | null;
    zone?: string | null;
    phone?: string | null;
    heroNote?: string | null;
    websiteUrl?: string | null;
  };
}

const CUISINES = [
  "Romanian", "Italian", "Japanese", "Turkish", "French", "Chinese",
  "Lebanese", "Spanish", "Greek", "Thai", "Indian", "Mexican", "Korean",
  "Balkan", "American", "Fusion", "Other",
];

export function PartnerProfileForm({ initialValues }: Props) {
  const t = useT("partner.settings");
  const [state, action, pending] = useActionState<
    SaveProfileResult | undefined,
    FormData
  >(savePartnerProfile, undefined);
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>(
    initialValues.cuisines ?? [],
  );

  useEffect(() => {
    if (state?.ok) toast.success(t("profile.toastSaved"));
  }, [state, t]);

  const errorText = state?.error
    ? state.error === "billing_locked"
      ? t("profile.errors.billing_locked")
      : state.error
    : null;

  const toggleCuisine = (c: string) =>
    setSelectedCuisines((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <Field label={t("profile.nameLabel")} name="name" required defaultValue={initialValues.name ?? ""} />

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          {t("profile.cuisinesLabel")} <span className="text-error">*</span>
        </label>
        <p className="text-xs text-text-muted">{t("profile.cuisinesHint")}</p>
        <div className="flex flex-wrap gap-2">
          {CUISINES.map((c) => (
            <Pill
              key={c}
              label={cuisineLabel(c)}
              active={selectedCuisines.includes(c)}
              onToggle={() => toggleCuisine(c)}
            />
          ))}
        </div>
        {selectedCuisines.map((c) => (
          <input key={c} type="hidden" name="cuisines" value={c} />
        ))}
      </div>

      <Field label={t("profile.zoneLabel")} name="zone" defaultValue={initialValues.zone ?? ""} />

      <Field label={t("profile.addressLabel")} name="address" required defaultValue={initialValues.address ?? ""} />

      <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
        <Field label={t("profile.phoneLabel")} name="phone" type="tel" defaultValue={initialValues.phone ?? ""} />
        <Field label={t("profile.websiteLabel")} name="websiteUrl" type="url" defaultValue={initialValues.websiteUrl ?? ""} />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="heroNote">
          {t("profile.heroNoteLabel")}
        </label>
        <textarea
          id="heroNote"
          name="heroNote"
          rows={2}
          maxLength={160}
          defaultValue={initialValues.heroNote ?? ""}
          placeholder={t("profile.heroNotePlaceholder")}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
        />
        <p className="text-xs text-text-muted">{t("profile.heroNoteHint")}</p>
      </div>

      {errorText && <p className="text-sm text-error" role="alert">{errorText}</p>}

      <div className="pt-2">
        <Button disabled={pending} type="submit">
          {pending ? t("profile.saving") : t("profile.save")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label, name, type = "text", required, defaultValue,
}: {
  label: string; name: string; type?: string; required?: boolean; defaultValue?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium" htmlFor={name}>
        {label}
        {required && <span className="text-error ml-1">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />
    </div>
  );
}
