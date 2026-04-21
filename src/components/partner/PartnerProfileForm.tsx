"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/button";
import { toast } from "@/components/toast";
import {
  savePartnerProfile,
  type SaveProfileResult,
} from "@/app/partner/(dashboard)/profile/actions";

interface Props {
  initialValues: {
    name?: string | null;
    cuisine?: string | null;
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

  useEffect(() => {
    if (state?.ok) toast.success("Profile saved.");
  }, [state]);

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <Field label="Restaurant name" name="name" required defaultValue={initialValues.name ?? ""} />

      <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="cuisine">
            Cuisine <span className="text-error">*</span>
          </label>
          <select
            id="cuisine"
            name="cuisine"
            required
            defaultValue={initialValues.cuisine ?? ""}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface-white focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            <option value="" disabled>Select cuisine…</option>
            {CUISINES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Field label="Zone / neighbourhood" name="zone" defaultValue={initialValues.zone ?? ""} />
      </div>

      <Field label="Full address" name="address" required defaultValue={initialValues.address ?? ""} />

      <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
        <Field label="Phone" name="phone" type="tel" defaultValue={initialValues.phone ?? ""} />
        <Field label="Website" name="websiteUrl" type="url" defaultValue={initialValues.websiteUrl ?? ""} />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="heroNote">
          One-line story
        </label>
        <textarea
          id="heroNote"
          name="heroNote"
          rows={2}
          maxLength={160}
          defaultValue={initialValues.heroNote ?? ""}
          placeholder="Grandmother's recipes from the heart of Centru Vechi."
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
        />
        <p className="text-xs text-text-muted">Shown italicised on your menu hero. Max 160 chars.</p>
      </div>

      {state?.error && <p className="text-sm text-error" role="alert">{state.error}</p>}

      <div className="pt-2">
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save changes"}
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
