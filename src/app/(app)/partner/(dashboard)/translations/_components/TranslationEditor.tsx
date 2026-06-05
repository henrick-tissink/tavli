"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useT } from "@/lib/i18n/messages-provider";
import { LOCALE_ENDONYMS } from "@/lib/i18n/locale";
import { saveTranslations, type TranslationFields } from "../actions";

type Locale = "en" | "de";
type FieldKey = keyof TranslationFields;

const FIELD_DEFS: { key: FieldKey; long?: boolean }[] = [
  { key: "heroSubtitle" },
  { key: "descriptionShort", long: true },
  { key: "descriptionLong", long: true },
];

export function TranslationEditor({
  initial,
  roReference,
}: {
  initial: Record<Locale, TranslationFields>;
  roReference: Record<FieldKey, string | null>;
}) {
  const t = useT("partner.settings");
  const router = useRouter();
  const [values, setValues] = useState<Record<Locale, TranslationFields>>(initial);
  const [pending, startTransition] = useTransition();

  function update(locale: Locale, key: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [locale]: { ...prev[locale], [key]: v } }));
  }

  function save() {
    startTransition(async () => {
      const res = await saveTranslations(values);
      if (res.ok) {
        toast.success(t("translations.toastSavedAll"));
        router.refresh();
      } else {
        const msg =
          res.error === "billing_locked"
            ? t("translations.errors.billing_locked")
            : (res.error ?? t("translations.toastFailed"));
        toast.error(msg);
      }
    });
  }

  const inputCls =
    "w-full rounded-button border border-border bg-surface-white px-3.5 py-2.5 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30";

  return (
    <div>
      <div className="space-y-8">
        {FIELD_DEFS.map((f) => {
          const ro = roReference[f.key];
          return (
            <div key={f.key} className="rounded-card border border-border bg-surface-white p-4 desktop:p-5">
              <h2 className="text-sm font-bold text-text-primary">
                {t(`translations.fields.${f.key}`)}
              </h2>
              <div
                className={
                  f.long
                    ? "mt-3 space-y-4"
                    : "mt-3 grid gap-4 desktop:grid-cols-3"
                }
              >
                {/* Romanian — read-only source */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {LOCALE_ENDONYMS.ro}
                  </p>
                  {ro ? (
                    <div className="rounded-button border border-border bg-surface-bg px-3.5 py-2.5 text-sm text-text-primary">
                      {ro}
                      <Link
                        href="/partner/profile"
                        className="mt-1 block text-xs font-semibold text-brand-primary hover:underline"
                      >
                        {t("translations.editOnProfile")}
                      </Link>
                    </div>
                  ) : (
                    <p className="rounded-button border border-dashed border-border px-3.5 py-2.5 text-xs italic text-text-muted">
                      {t("translations.noRomanian")}
                    </p>
                  )}
                </div>

                {/* English + German — editable */}
                {(["en", "de"] as Locale[]).map((loc) => (
                  <div key={loc} className="space-y-1.5">
                    <label
                      className="text-xs font-semibold uppercase tracking-wide text-text-secondary"
                      htmlFor={`${loc}-${f.key}`}
                    >
                      {LOCALE_ENDONYMS[loc]}
                    </label>
                    {f.long ? (
                      <textarea
                        id={`${loc}-${f.key}`}
                        rows={3}
                        value={values[loc][f.key] ?? ""}
                        onChange={(e) => update(loc, f.key, e.target.value)}
                        className={`${inputCls} resize-none`}
                      />
                    ) : (
                      <input
                        id={`${loc}-${f.key}`}
                        value={values[loc][f.key] ?? ""}
                        onChange={(e) => update(loc, f.key, e.target.value)}
                        className={inputCls}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-8 inline-flex min-h-[48px] items-center rounded-button bg-brand-primary px-6 py-3 text-sm font-bold text-white shadow-card transition-all hover:bg-brand-primary-dark active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        {t("translations.saveAll")}
      </button>
    </div>
  );
}
