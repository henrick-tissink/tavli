"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { updateDinerAction } from "../actions";

const ERRORS: Record<string, string> = {
  billing_locked: "Contul are facturarea suspendată — reia plata pentru a edita oaspeții.",
  "Forbidden.": "Nu ai permisiunea de a edita acest oaspete.",
};

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
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
      if (res.ok) setMsg({ ok: true, text: "Salvat." });
      else setMsg({ ok: false, text: ERRORS[res.error] ?? "Nu am putut salva." });
    });
  }

  const set = (k: keyof typeof state) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setState((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label>
          <span className={labelClass}>Zi de naștere</span>
          <input type="date" value={state.birthdayDate} onChange={set("birthdayDate")} className={fieldClass} />
        </label>
        <label>
          <span className={labelClass}>Aniversare</span>
          <input type="date" value={state.anniversaryDate} onChange={set("anniversaryDate")} className={fieldClass} />
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Ocazii (separate prin virgulă)</span>
        <input value={state.occasionTags} onChange={set("occasionTags")} placeholder="birthday, anniversary" className={fieldClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Alergii (separate prin virgulă)</span>
        <input value={state.allergies} onChange={set("allergies")} placeholder="nuci, lactoză" className={fieldClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Preferințe alimentare (separate prin virgulă)</span>
        <input value={state.dietaryPreferences} onChange={set("dietaryPreferences")} placeholder="vegetarian" className={fieldClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Note interne</span>
        <textarea value={state.internalNotes} onChange={set("internalNotes")} rows={3} maxLength={2000} className={fieldClass} />
      </label>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Se salvează…" : "Salvează"}
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
