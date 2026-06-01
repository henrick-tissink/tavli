"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { saveTranslation, type TranslationFields } from "../actions";

type Locale = "en" | "de";

const FIELD_DEFS: { key: keyof TranslationFields; label: string; long?: boolean }[] = [
  { key: "tagline", label: "Tagline" },
  { key: "heroSubtitle", label: "Subtitlu hero" },
  { key: "descriptionShort", label: "Descriere scurtă", long: true },
  { key: "descriptionLong", label: "Descriere lungă", long: true },
  { key: "chefBio", label: "Bio chef", long: true },
  { key: "ambience", label: "Ambianță", long: true },
];

export function TranslationEditor({
  initial,
  roReference,
}: {
  initial: Record<Locale, TranslationFields>;
  roReference: { descriptionShort: string | null; heroSubtitle: string | null };
}) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [values, setValues] = useState<Record<Locale, TranslationFields>>(initial);
  const [pending, startTransition] = useTransition();

  function update(key: keyof TranslationFields, v: string) {
    setValues((prev) => ({ ...prev, [locale]: { ...prev[locale], [key]: v } }));
  }

  function save() {
    startTransition(async () => {
      const res = await saveTranslation(locale, values[locale]);
      if (res.ok) {
        toast.success(`Traducere ${locale.toUpperCase()} salvată.`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Salvarea nu a reușit.");
      }
    });
  }

  const inputCls =
    "mt-1.5 w-full rounded-button border border-border bg-surface-white px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30";

  return (
    <div>
      <div role="tablist" className="inline-flex gap-1 rounded-pill border border-border bg-surface-white p-1">
        {(["en", "de"] as Locale[]).map((l) => (
          <button
            key={l}
            role="tab"
            aria-selected={locale === l}
            onClick={() => setLocale(l)}
            className={[
              "min-h-[40px] rounded-pill px-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
              locale === l ? "bg-text-primary text-surface-white" : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {l === "en" ? "English" : "Deutsch"}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-5">
        {FIELD_DEFS.map((f) => {
          const ref =
            f.key === "descriptionShort"
              ? roReference.descriptionShort
              : f.key === "heroSubtitle"
                ? roReference.heroSubtitle
                : null;
          return (
            <div key={f.key}>
              <label className="block text-sm font-semibold text-text-primary" htmlFor={`${locale}-${f.key}`}>
                {f.label}
              </label>
              {ref && <p className="mt-0.5 text-xs italic text-text-muted">RO: {ref}</p>}
              {f.long ? (
                <textarea
                  id={`${locale}-${f.key}`}
                  rows={3}
                  value={values[locale][f.key] ?? ""}
                  onChange={(e) => update(f.key, e.target.value)}
                  className={`${inputCls} resize-none`}
                />
              ) : (
                <input
                  id={`${locale}-${f.key}`}
                  value={values[locale][f.key] ?? ""}
                  onChange={(e) => update(f.key, e.target.value)}
                  className={inputCls}
                />
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-6 inline-flex min-h-[48px] items-center rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card transition-all hover:bg-brand-primary-dark active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        Salvează {locale === "en" ? "English" : "Deutsch"}
      </button>
    </div>
  );
}
