"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { addVenueToOrgAction } from "../../../venues/actions";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function AddVenueForm({
  organizationId,
  cities,
  showBillingNote,
}: {
  organizationId: string;
  cities: { id: string; name: string }[];
  showBillingNote: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const cityId = String(form.get("cityId") ?? "");
    const address = String(form.get("address") ?? "").trim();
    if (!name || !cityId) {
      setError("Completează numele și orașul.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addVenueToOrgAction({
        organizationId,
        name,
        slug: slugify(name),
        cityId,
        address: address || undefined,
      });
      if (res.ok) {
        toast.success("Locație creată. Continuă configurarea.");
        router.push(`/partner/org/${organizationId}/venues`);
        router.refresh();
      } else if (res.error.includes("TV701")) {
        setError("Adăugarea de locații necesită planul Tavli Pro. Treci pe Pro din pagina de facturare.");
      } else if (res.error.includes("TV702")) {
        setError("Ai atins limita de locații a planului tău.");
      } else {
        setError("Crearea locației nu a reușit. Încearcă din nou.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-5">
      <div>
        <label className="block text-sm font-semibold text-text-primary" htmlFor="name">
          Numele locației
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Bistro Lipscani"
          className="mt-1.5 w-full rounded-button border border-border bg-surface-white px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-text-primary" htmlFor="cityId">
          Oraș
        </label>
        <select
          id="cityId"
          name="cityId"
          required
          defaultValue=""
          className="mt-1.5 w-full rounded-button border border-border bg-surface-white px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30"
        >
          <option value="" disabled>
            Alege orașul…
          </option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-text-primary" htmlFor="address">
          Adresă <span className="font-normal text-text-muted">(opțional)</span>
        </label>
        <input
          id="address"
          name="address"
          placeholder="Str. Lipscani 12"
          className="mt-1.5 w-full rounded-button border border-border bg-surface-white px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30"
        />
      </div>

      {showBillingNote && (
        <p className="rounded-button bg-brand-primary-soft px-4 py-3 text-xs text-text-secondary">
          Această locație depășește cele 3 incluse în Pro — se adaugă +€15/lună la abonament, pro-rata.
        </p>
      )}

      {error && (
        <p className="text-sm font-medium text-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[48px] items-center rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card transition-all hover:bg-brand-primary-dark active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        Creează locația
      </button>
    </form>
  );
}
