"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/button";
import { Pill } from "@/components/pill";
import { cuisineLabel } from "@/lib/types";
import {
  saveProfile,
  type SaveProfileResult,
} from "@/app/onboard/[token]/profile/actions";

interface Props {
  token: string;
  initialValues: {
    name?: string;
    cuisines?: string[];
    address?: string;
    zone?: string;
    phone?: string;
    heroNote?: string;
    websiteUrl?: string;
  };
}

const CUISINES = [
  "Romanian",
  "Italian",
  "Japanese",
  "Turkish",
  "French",
  "Chinese",
  "Lebanese",
  "Spanish",
  "Greek",
  "Thai",
  "Indian",
  "Mexican",
  "Korean",
  "Balkan",
  "American",
  "Fusion",
  "Other",
];

export function ProfileForm({ token, initialValues }: Props) {
  const action = saveProfile.bind(null, token);
  const [state, dispatch, pending] = useActionState<
    SaveProfileResult | undefined,
    FormData
  >(action, undefined);
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>(
    initialValues.cuisines ?? [],
  );

  const toggleCuisine = (c: string) =>
    setSelectedCuisines((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  return (
    <form action={dispatch} className="space-y-5">
      <Field label="Numele restaurantului" name="name" required defaultValue={initialValues.name} placeholder="Casa Veche" />

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          Bucătării <span className="text-error">*</span>
        </label>
        <p className="text-xs text-text-muted">Alege una sau mai multe.</p>
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

      <Field
        label="Zonă / cartier"
        name="zone"
        placeholder="Centru Vechi"
        defaultValue={initialValues.zone}
      />

      <Field
        label="Adresă completă"
        name="address"
        required
        defaultValue={initialValues.address}
        placeholder="Str. Lipscani 45, București"
      />

      <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
        <Field label="Telefon" name="phone" type="tel" defaultValue={initialValues.phone} placeholder="+40 7xx xxx xxx" />
        <Field label="Site web" name="websiteUrl" type="url" defaultValue={initialValues.websiteUrl} placeholder="https://…" />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="heroNote">
          Povestea într-o frază
        </label>
        <textarea
          id="heroNote"
          name="heroNote"
          rows={2}
          maxLength={160}
          defaultValue={initialValues.heroNote}
          placeholder="Rețete de la bunica, din inima Centrului Vechi."
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
        />
        <p className="text-xs text-text-muted">
          Apare ca rândul italic de pe meniul tău. Maxim 160 de caractere.
        </p>
      </div>

      {state?.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <div className="pt-2">
        <Button fullWidth disabled={pending} type="submit">
          {pending ? "Se salvează…" : "Salvează și continuă la program"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
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
        placeholder={placeholder}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />
    </div>
  );
}
