"use client";

import { RO_DATE_FORMAT, localDateFromIso } from "./helpers";
import { CuiLookupField } from "@/components/corporate/CuiLookupField";
import type { OccasionKind, ReservationFormState } from "./types";
import { useT } from "@/lib/i18n/messages-provider";

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
  occasion: OccasionKind;
  occasionDate: string;
  onChange: (
    field: "name" | "phone" | "email" | "notes" | "occasion" | "occasionDate",
    value: string,
  ) => void;

  // Validation errors (map of field -> message). Empty object means all valid.
  errors: Partial<Record<"name" | "phone" | "email" | "notes", string>>;

  acceptsCorporateMeals: boolean;
  bookingForCompany: boolean;
  companyCui: string;
  companyName: string;
  onPatch: (p: Partial<ReservationFormState>) => void;
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
  occasion,
  occasionDate,
  onChange,
  errors,
  acceptsCorporateMeals,
  bookingForCompany,
  companyCui,
  companyName,
  onPatch,
}: StepIdentityProps) {
  const t = useT("booking");

  function formatDateSummary(isoDate: string): string {
    const d = localDateFromIso(isoDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (d.getTime() === today.getTime()) return t("sheet.stepIdentity.summaryToday");
    if (d.getTime() === tomorrow.getTime()) return t("sheet.stepIdentity.summaryTomorrow");
    return RO_DATE_FORMAT.format(d);
  }

  const dateSummary = formatDateSummary(date);
  const guestsLabel = t("sheet.stepIdentity.guests", { count: guests });
  const summary = [
    dateSummary,
    slot,
    guestsLabel,
    zone ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold text-text-primary">
        {t("sheet.stepIdentity.title")}
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
          {t("sheet.stepIdentity.nameLabel")}
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
          {t("sheet.stepIdentity.phoneLabel")}
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
          {t("sheet.stepIdentity.emailLabel")}
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

      {/* Special occasion (optional) — feeds the birthday/anniversary campaigns */}
      <div className="space-y-1">
        <label
          htmlFor="identity-occasion"
          className="text-sm font-semibold text-text-primary"
        >
          {t("sheet.stepIdentity.occasionLabel")}
        </label>
        <select
          id="identity-occasion"
          value={occasion}
          onChange={(e) => onChange("occasion", e.target.value)}
          className="rounded-button border border-border px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors"
        >
          <option value="">{t("sheet.stepIdentity.occasionNone")}</option>
          <option value="birthday">{t("sheet.stepIdentity.occasionBirthday")}</option>
          <option value="anniversary">{t("sheet.stepIdentity.occasionAnniversary")}</option>
        </select>
        {occasion !== "" && (
          <div className="pt-1">
            <label htmlFor="identity-occasion-date" className="text-xs text-text-muted">
              {occasion === "birthday"
                ? t("sheet.stepIdentity.birthdayDateLabel")
                : t("sheet.stepIdentity.anniversaryDateLabel")}
            </label>
            <input
              id="identity-occasion-date"
              type="date"
              value={occasionDate}
              onChange={(e) => onChange("occasionDate", e.target.value)}
              className="rounded-button border border-border px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors"
            />
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label
          htmlFor="identity-notes"
          className="text-sm font-semibold text-text-primary"
        >
          {t("sheet.stepIdentity.notesLabel")}
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

      {acceptsCorporateMeals && (
        <div className="space-y-2 border-t border-border pt-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <input
              type="checkbox"
              checked={bookingForCompany}
              onChange={(e) => onPatch({ bookingForCompany: e.target.checked })}
            />
            {t("sheet.stepIdentity.companyToggleLabel")}
          </label>
          {bookingForCompany && (
            <CuiLookupField
              cui={companyCui}
              name={companyName}
              onChange={(p) =>
                onPatch({
                  companyCui: p.cui,
                  ...(p.name !== undefined ? { companyName: p.name } : {}),
                })
              }
              labels={{
                fieldLabel: t("sheet.stepIdentity.companyCui.fieldLabel"),
                placeholder: t("sheet.stepIdentity.companyCui.placeholder"),
                searchingAriaLabel: t("sheet.stepIdentity.companyCui.searchingAriaLabel"),
                foundAriaLabel: t("sheet.stepIdentity.companyCui.foundAriaLabel"),
                resolvedPrefix: t("sheet.stepIdentity.companyCui.resolvedPrefix"),
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
