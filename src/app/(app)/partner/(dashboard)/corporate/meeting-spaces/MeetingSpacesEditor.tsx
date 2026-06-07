"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Users, Clock, X } from "lucide-react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import {
  createMeetingSpaceAction,
  updateMeetingSpaceAction,
  deactivateMeetingSpaceAction,
} from "./actions";

export interface MeetingSpaceRow {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  capacity: number;
  hourlyRateCents: number;
  amenities: string[];
  openTime: string; // "HH:MM:SS" from postgres
  closeTime: string;
  minBookingMinutes: number;
  photoStoragePath: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface FormState {
  name: string;
  description: string;
  capacity: string;
  hourlyRateLei: string;
  amenities: string;
  openTime: string; // "HH:MM"
  closeTime: string;
  minBookingMinutes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  capacity: "",
  hourlyRateLei: "",
  amenities: "",
  openTime: "09:00",
  closeTime: "18:00",
  minBookingMinutes: "60",
};

const MIN_DURATION_OPTIONS = [30, 60, 90, 120, 180, 240];

const hhmm = (t: string) => t.slice(0, 5);

function rowToForm(row: MeetingSpaceRow): FormState {
  return {
    name: row.name,
    description: row.description ?? "",
    capacity: String(row.capacity),
    hourlyRateLei: String(row.hourlyRateCents / 100),
    amenities: row.amenities.join(", "),
    openTime: hhmm(row.openTime),
    closeTime: hhmm(row.closeTime),
    minBookingMinutes: String(row.minBookingMinutes),
  };
}

export function MeetingSpacesEditor({
  restaurantId,
  initialSpaces,
}: {
  restaurantId: string;
  initialSpaces: MeetingSpaceRow[];
}) {
  const t = useT("partner.corporate");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const beginCreate = () => {
    setError(null);
    setEditing("new");
    setForm(EMPTY_FORM);
  };

  const beginEdit = (row: MeetingSpaceRow) => {
    setError(null);
    setEditing(row.id);
    setForm(rowToForm(row));
  };

  const cancel = () => {
    setError(null);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  /** Client-side validation backstop; the action re-validates with zod. */
  const parseForm = () => {
    if (!form.name.trim()) {
      setError(t("meetingSpaces.nameRequired"));
      return null;
    }
    const capacity = parseInt(form.capacity, 10);
    if (!Number.isFinite(capacity) || capacity < 1) {
      setError(t("meetingSpaces.capacityPositive"));
      return null;
    }
    const rateLei = parseFloat(form.hourlyRateLei || "0");
    if (!Number.isFinite(rateLei) || rateLei < 0) {
      setError(t("meetingSpaces.rateInvalid"));
      return null;
    }
    if (form.openTime >= form.closeTime) {
      setError(t("meetingSpaces.hoursOrder"));
      return null;
    }
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      capacity,
      hourlyRateCents: Math.round(rateLei * 100),
      amenities: form.amenities
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      openTime: form.openTime,
      closeTime: form.closeTime,
      minBookingMinutes: parseInt(form.minBookingMinutes, 10),
    };
  };

  const submit = (id: string | "new") => {
    setError(null);
    const fields = parseForm();
    if (!fields) return;
    start(async () => {
      const res =
        id === "new"
          ? await createMeetingSpaceAction({ restaurantId, ...fields })
          : await updateMeetingSpaceAction({ id, ...fields });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      cancel();
      router.refresh();
    });
  };

  const handleDeactivate = (row: MeetingSpaceRow) => {
    if (!confirm(t("meetingSpaces.deactivateConfirm", { name: row.name }))) return;
    setError(null);
    start(async () => {
      const res = await deactivateMeetingSpaceAction({ id: row.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {error && (
        <p
          className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}

      {initialSpaces.length === 0 && editing !== "new" && (
        <div className="bg-surface-white rounded-card border border-border p-6">
          <p className="font-semibold text-text-primary">{t("meetingSpaces.emptyTitle")}</p>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">
            {t("meetingSpaces.emptyBody")}
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={beginCreate} disabled={pending}>
              <span className="inline-flex items-center gap-2">
                <Plus size={16} />
                {t("meetingSpaces.addFirst")}
              </span>
            </Button>
          </div>
        </div>
      )}

      {initialSpaces.map((row) =>
        editing === row.id ? (
          <MeetingSpaceForm
            key={row.id}
            title={t("meetingSpaces.editTitle")}
            form={form}
            setForm={setForm}
            onCancel={cancel}
            onSubmit={() => submit(row.id)}
            submitLabel={t("meetingSpaces.save")}
            pending={pending}
          />
        ) : (
          <article
            key={row.id}
            className="bg-surface-white rounded-card border border-border p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-bold text-text-primary truncate">
                  {row.name}
                </h3>
                <p className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary mt-1">
                  <span className="inline-flex items-center gap-1">
                    <Users size={14} />
                    {t("meetingSpaces.capacitySeats", { count: row.capacity })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={14} />
                    {t("meetingSpaces.hoursValue", {
                      open: hhmm(row.openTime),
                      close: hhmm(row.closeTime),
                    })}
                  </span>
                  <span>
                    {t("meetingSpaces.ratePerHour", {
                      amount: String(row.hourlyRateCents / 100),
                    })}
                  </span>
                </p>
                {row.amenities.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {row.amenities.map((a) => (
                      <span
                        key={a}
                        className="rounded-pill bg-surface-bg px-2 py-0.5 text-xs font-medium text-text-secondary"
                      >
                        {a}
                      </span>
                    ))}
                  </p>
                )}
                {row.description && (
                  <p className="text-sm text-text-secondary mt-2 leading-relaxed whitespace-pre-line">
                    {row.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => beginEdit(row)}
                  disabled={pending}
                  aria-label={t("meetingSpaces.editAriaLabel", { name: row.name })}
                  className="p-2 rounded-lg text-text-secondary hover:bg-surface-bg disabled:opacity-50"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeactivate(row)}
                  disabled={pending}
                  aria-label={t("meetingSpaces.deactivateAriaLabel", { name: row.name })}
                  className="p-2 rounded-lg text-text-secondary hover:bg-red-50 hover:text-error disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </article>
        ),
      )}

      {editing === "new" && (
        <MeetingSpaceForm
          title={t("meetingSpaces.newTitle")}
          form={form}
          setForm={setForm}
          onCancel={cancel}
          onSubmit={() => submit("new")}
          submitLabel={t("meetingSpaces.add")}
          pending={pending}
        />
      )}

      {editing === null && initialSpaces.length > 0 && (
        <div>
          <Button variant="secondary" onClick={beginCreate} disabled={pending}>
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              {t("meetingSpaces.addSpace")}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

function MeetingSpaceForm({
  title,
  form,
  setForm,
  onCancel,
  onSubmit,
  submitLabel,
  pending,
}: {
  title: string;
  form: FormState;
  setForm: (next: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
}) {
  const t = useT("partner.corporate");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="bg-surface-white rounded-card border border-border p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-text-primary">{title}</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("meetingSpaces.closeAriaLabel")}
          className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-bg"
        >
          <X size={16} />
        </button>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          {t("meetingSpaces.nameLabel")}
        </span>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          maxLength={120}
          required
          placeholder={t("meetingSpaces.namePlaceholder")}
          className={inputCls}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("meetingSpaces.capacityLabel")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            required
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("meetingSpaces.rateLabel")}
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={form.hourlyRateLei}
            onChange={(e) => setForm({ ...form, hourlyRateLei: e.target.value })}
            required
            className={inputCls}
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("meetingSpaces.openLabel")}
          </span>
          <input
            type="time"
            step={1800}
            value={form.openTime}
            onChange={(e) => setForm({ ...form, openTime: e.target.value })}
            required
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("meetingSpaces.closeLabel")}
          </span>
          <input
            type="time"
            step={1800}
            value={form.closeTime}
            onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
            required
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("meetingSpaces.minDurationLabel")}
          </span>
          <select
            value={form.minBookingMinutes}
            onChange={(e) => setForm({ ...form, minBookingMinutes: e.target.value })}
            className={inputCls}
          >
            {MIN_DURATION_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {t("meetingSpaces.minDurationOption", { minutes: m })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          {t("meetingSpaces.amenitiesLabel")}{" "}
          <span className="text-text-muted">{t("meetingSpaces.amenitiesOptional")}</span>
        </span>
        <input
          type="text"
          value={form.amenities}
          onChange={(e) => setForm({ ...form, amenities: e.target.value })}
          placeholder={t("meetingSpaces.amenitiesPlaceholder")}
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          {t("meetingSpaces.descriptionLabel")}{" "}
          <span className="text-text-muted">{t("meetingSpaces.descriptionOptional")}</span>
        </span>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          maxLength={2000}
          rows={3}
          placeholder={t("meetingSpaces.descriptionPlaceholder")}
          className={`${inputCls} resize-y`}
        />
      </label>

      <div className="flex items-center gap-2 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {t("meetingSpaces.cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t("meetingSpaces.saving") : submitLabel}
        </Button>
      </div>
    </form>
  );
}
