"use client";

import { RO_DATE_FORMAT, localDateFromIso } from "./helpers";

interface StepIdentityProps {
  // Selection summary, displayed in a preview card at top
  date: string; // ISO yyyy-mm-dd, format for display
  slot: string; // "19:30"
  guests: number;
  zone: string | null;

  // Identity fields (controlled)
  name: string;
  phone: string;
  email: string;
  notes: string;
  onChange: (
    field: "name" | "phone" | "email" | "notes",
    value: string,
  ) => void;

  // Validation errors (map of field -> message). Empty object means all valid.
  errors: Partial<Record<"name" | "phone" | "email" | "notes", string>>;
}

function formatDateSummary(isoDate: string): string {
  const d = localDateFromIso(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (d.getTime() === today.getTime()) return "Astăzi";
  if (d.getTime() === tomorrow.getTime()) return "Mâine";
  return RO_DATE_FORMAT.format(d);
}

export function StepIdentity({
  date,
  slot,
  guests,
  zone,
  name,
  phone,
  email,
  notes,
  onChange,
  errors,
}: StepIdentityProps) {
  const dateSummary = formatDateSummary(date);
  const summary = [
    dateSummary,
    slot,
    `${guests} persoane`,
    zone ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold text-text-primary">
        Detaliile tale
      </h2>

      {/* Selection preview card */}
      <div className="rounded-card border border-border bg-surface-bg p-4">
        <p className="text-sm font-medium text-text-primary">{summary}</p>
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label
          htmlFor="identity-name"
          className="text-sm font-semibold text-text-primary"
        >
          Nume
        </label>
        <input
          id="identity-name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => onChange("name", e.target.value)}
          className={`rounded-button border px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors ${
            errors.name ? "border-error" : "border-border"
          }`}
        />
        {errors.name && (
          <p className="text-xs text-error">{errors.name}</p>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-1">
        <label
          htmlFor="identity-phone"
          className="text-sm font-semibold text-text-primary"
        >
          Telefon
        </label>
        <input
          id="identity-phone"
          type="tel"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => onChange("phone", e.target.value)}
          className={`rounded-button border px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors ${
            errors.phone ? "border-error" : "border-border"
          }`}
        />
        {errors.phone && (
          <p className="text-xs text-error">{errors.phone}</p>
        )}
      </div>

      {/* Email */}
      <div className="space-y-1">
        <label
          htmlFor="identity-email"
          className="text-sm font-semibold text-text-primary"
        >
          Email (opțional)
        </label>
        <input
          id="identity-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => onChange("email", e.target.value)}
          className={`rounded-button border px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors ${
            errors.email ? "border-error" : "border-border"
          }`}
        />
        {errors.email && (
          <p className="text-xs text-error">{errors.email}</p>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label
          htmlFor="identity-notes"
          className="text-sm font-semibold text-text-primary"
        >
          Note (opțional)
        </label>
        <textarea
          id="identity-notes"
          maxLength={280}
          value={notes}
          onChange={(e) => onChange("notes", e.target.value)}
          rows={3}
          className={`rounded-button border px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors resize-none ${
            errors.notes ? "border-error" : "border-border"
          }`}
        />
        <p className="text-xs text-text-muted text-right">
          {notes.length} / 280
        </p>
        {errors.notes && (
          <p className="text-xs text-error">{errors.notes}</p>
        )}
      </div>
    </div>
  );
}
