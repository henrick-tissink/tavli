"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import { updateDinerAction } from "../actions";

export interface DinerEditFormProps {
  dinerId: string;
  initial: {
    birthdayDate: string;
    anniversaryDate: string;
    occasionTags: string;
    allergies: string;
    dietaryPreferences: string;
    internalNotes: string;
  };
}

const fieldClass =
  "w-full rounded-lg border border-border bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-text-secondary";

function toList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export function DinerEditForm({ dinerId, initial }: DinerEditFormProps) {
  const t = useT("partner.diners");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ERRORS: Record<string, string> = {
    billing_locked: t("form.errors.billing_locked"),
    "Forbidden.": t("form.errors.forbidden"),
  };

  function save() {
    startTransition(async () => {
      setMsg(null);
      const res = await updateDinerAction({
        dinerId,
        birthdayDate: state.birthdayDate || null,
        anniversaryDate: state.anniversaryDate || null,
        occasionTags: toList(state.occasionTags),
        allergies: toList(state.allergies),
        dietaryPreferences: toList(state.dietaryPreferences),
        internalNotes: state.internalNotes || null,
      });
      if (res.ok) setMsg({ ok: true, text: t("form.saved") });
      else setMsg({ ok: false, text: ERRORS[res.error] ?? t("form.saveFailed") });
    });
  }

  const set = (k: keyof typeof state) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setState((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label>
          <span className={labelClass}>{t("form.birthday")}</span>
          <input type="date" value={state.birthdayDate} onChange={set("birthdayDate")} className={fieldClass} />
        </label>
        <label>
          <span className={labelClass}>{t("form.anniversary")}</span>
          <input type="date" value={state.anniversaryDate} onChange={set("anniversaryDate")} className={fieldClass} />
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>{t("form.occasions")}</span>
        <input value={state.occasionTags} onChange={set("occasionTags")} placeholder={t("form.occasionsPlaceholder")} className={fieldClass} />
      </label>
      <label className="block">
        <span className={labelClass}>{t("form.allergies")}</span>
        <input value={state.allergies} onChange={set("allergies")} placeholder={t("form.allergiesPlaceholder")} className={fieldClass} />
      </label>
      <label className="block">
        <span className={labelClass}>{t("form.dietary")}</span>
        <input value={state.dietaryPreferences} onChange={set("dietaryPreferences")} placeholder={t("form.dietaryPlaceholder")} className={fieldClass} />
      </label>
      <label className="block">
        <span className={labelClass}>{t("form.notes")}</span>
        <textarea value={state.internalNotes} onChange={set("internalNotes")} rows={3} maxLength={2000} className={fieldClass} />
      </label>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? t("form.saving") : t("form.save")}
        </Button>
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
