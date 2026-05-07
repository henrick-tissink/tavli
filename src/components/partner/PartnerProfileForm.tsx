"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/button";
import { Pill } from "@/components/pill";
import { toast } from "@/components/toast";
import {
  savePartnerProfile,
  type SaveProfileResult,
} from "@/app/partner/(dashboard)/profile/actions";

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
  const [state, action, pending] = useActionState<
    SaveProfileResult | undefined,
    FormData
  >(savePartnerProfile, undefined);
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>(
    initialValues.cuisines ?? [],
  );

  useEffect(() => {
    if (state?.ok) toast.success("Profilul a fost salvat.");
  }, [state]);

  const toggleCuisine = (c: string) =>
    setSelectedCuisines((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <Field label="Numele restaurantului" name="name" required defaultValue={initialValues.name ?? ""} />

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          Bucătării <span className="text-error">*</span>
        </label>
        <p className="text-xs text-text-muted">Alege una sau mai multe.</p>
        <div className="flex flex-wrap gap-2">
          {CUISINES.map((c) => (
            <Pill
              key={c}
              label={c}
              active={selectedCuisines.includes(c)}
              onToggle={() => toggleCuisine(c)}
            />
          ))}
        </div>
        {selectedCuisines.map((c) => (
          <input key={c} type="hidden" name="cuisines" value={c} />
        ))}
      </div>

      <Field label="Zonă / cartier" name="zone" defaultValue={initialValues.zone ?? ""} />

      <Field label="Adresa completă" name="address" required defaultValue={initialValues.address ?? ""} />

      <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
        <Field label="Telefon" name="phone" type="tel" defaultValue={initialValues.phone ?? ""} />
        <Field label="Website" name="websiteUrl" type="url" defaultValue={initialValues.websiteUrl ?? ""} />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="heroNote">
          Povestea pe scurt
        </label>
        <textarea
          id="heroNote"
          name="heroNote"
          rows={2}
          maxLength={160}
          defaultValue={initialValues.heroNote ?? ""}
          placeholder="Rețetele bunicii din inima Centrului Vechi."
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
        />
        <p className="text-xs text-text-muted">Apare cu italice pe partea principală a meniului. Maxim 160 caractere.</p>
      </div>

      {state?.error && <p className="text-sm text-error" role="alert">{state.error}</p>}

      <div className="pt-2">
        <Button disabled={pending} type="submit">
          {pending ? "Se salvează…" : "Salvează modificările"}
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
