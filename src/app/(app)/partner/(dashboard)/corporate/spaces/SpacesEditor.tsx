"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/button";
import {
  createSpaceAction,
  updateSpaceAction,
  deactivateSpaceAction,
} from "./actions";

export interface PrivateSpaceRow {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  capacityMin: number;
  capacityMax: number;
  photoStoragePath: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface FormState {
  name: string;
  description: string;
  capacityMin: string;
  capacityMax: string;
  photoStoragePath: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  capacityMin: "",
  capacityMax: "",
  photoStoragePath: "",
};

function rowToForm(row: PrivateSpaceRow): FormState {
  return {
    name: row.name,
    description: row.description ?? "",
    capacityMin: String(row.capacityMin),
    capacityMax: String(row.capacityMax),
    photoStoragePath: row.photoStoragePath ?? "",
  };
}

export function SpacesEditor({
  restaurantId,
  initialSpaces,
}: {
  restaurantId: string;
  initialSpaces: PrivateSpaceRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // null = not editing; "new" = creating; otherwise the space id being edited
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const beginCreate = () => {
    setError(null);
    setEditing("new");
    setForm(EMPTY_FORM);
  };

  const beginEdit = (row: PrivateSpaceRow) => {
    setError(null);
    setEditing(row.id);
    setForm(rowToForm(row));
  };

  const cancel = () => {
    setError(null);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const parseCapacities = (): { min: number; max: number } | null => {
    const min = parseInt(form.capacityMin, 10);
    const max = parseInt(form.capacityMax, 10);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < 1) {
      setError("Capacitățile trebuie să fie numere pozitive.");
      return null;
    }
    if (min > max) {
      setError("Capacitatea minimă nu poate depăși capacitatea maximă.");
      return null;
    }
    return { min, max };
  };

  const submitCreate = () => {
    setError(null);
    if (!form.name.trim()) {
      setError("Numele este obligatoriu.");
      return;
    }
    const caps = parseCapacities();
    if (!caps) return;
    start(async () => {
      const res = await createSpaceAction({
        restaurantId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        capacityMin: caps.min,
        capacityMax: caps.max,
        photoStoragePath: form.photoStoragePath.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      cancel();
      router.refresh();
    });
  };

  const submitUpdate = (id: string) => {
    setError(null);
    if (!form.name.trim()) {
      setError("Numele este obligatoriu.");
      return;
    }
    const caps = parseCapacities();
    if (!caps) return;
    start(async () => {
      const res = await updateSpaceAction({
        id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        capacityMin: caps.min,
        capacityMax: caps.max,
        photoStoragePath: form.photoStoragePath.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      cancel();
      router.refresh();
    });
  };

  const handleDeactivate = (row: PrivateSpaceRow) => {
    if (
      !confirm(
        `Dezactivezi „${row.name}”? Spațiul nu va mai apărea pentru clienți, dar istoricul rămâne intact.`,
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const res = await deactivateSpaceAction({ id: row.id });
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
          <p className="font-semibold text-text-primary">
            Niciun spațiu adăugat încă
          </p>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">
            Adaugă camerele sau saloanele pe care le închiriezi pentru
            evenimente private. Clienții le pot selecta atunci când trimit o
            cerere.
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={beginCreate} disabled={pending}>
              <span className="inline-flex items-center gap-2">
                <Plus size={16} />
                Adaugă primul spațiu
              </span>
            </Button>
          </div>
        </div>
      )}

      {initialSpaces.map((row) =>
        editing === row.id ? (
          <SpaceForm
            key={row.id}
            title="Editează spațiul"
            form={form}
            setForm={setForm}
            onCancel={cancel}
            onSubmit={() => submitUpdate(row.id)}
            submitLabel="Salvează"
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
                <p className="inline-flex items-center gap-1 text-sm text-text-secondary mt-1">
                  <Users size={14} />
                  {row.capacityMin === row.capacityMax
                    ? `${row.capacityMin} persoane`
                    : `${row.capacityMin}–${row.capacityMax} persoane`}
                </p>
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
                  aria-label={`Editează ${row.name}`}
                  className="p-2 rounded-lg text-text-secondary hover:bg-surface-bg disabled:opacity-50"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeactivate(row)}
                  disabled={pending}
                  aria-label={`Dezactivează ${row.name}`}
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
        <SpaceForm
          title="Spațiu nou"
          form={form}
          setForm={setForm}
          onCancel={cancel}
          onSubmit={submitCreate}
          submitLabel="Adaugă"
          pending={pending}
        />
      )}

      {editing === null && initialSpaces.length > 0 && (
        <div>
          <Button variant="secondary" onClick={beginCreate} disabled={pending}>
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              Adaugă spațiu
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

function SpaceForm({
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
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="bg-surface-white rounded-card border border-border p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-text-primary">
          {title}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Închide"
          className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-bg"
        >
          <X size={16} />
        </button>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-text-primary">Nume</span>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          maxLength={120}
          required
          placeholder="Ex. Salonul Verde"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            Capacitate min.
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={2000}
            value={form.capacityMin}
            onChange={(e) => setForm({ ...form, capacityMin: e.target.value })}
            required
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            Capacitate max.
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={2000}
            value={form.capacityMax}
            onChange={(e) => setForm({ ...form, capacityMax: e.target.value })}
            required
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          Descriere <span className="text-text-muted">(opțional)</span>
        </span>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          maxLength={2000}
          rows={3}
          placeholder="Detalii utile: amenajare, vedere, echipamente disponibile."
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary resize-y"
        />
      </label>

      <div className="flex items-center gap-2 justify-end pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          Anulează
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Se salvează…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
