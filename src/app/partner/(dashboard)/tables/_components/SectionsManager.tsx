"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/button";
import { createSectionAction, updateSectionAction, archiveSectionAction } from "../actions";

export interface SectionRow {
  id: string;
  restaurantId: string;
  organizationId: string;
  name: string;
  color: string | null;
  sortOrder: number;
}

interface SectionFormState {
  name: string;
  color: string;
  sortOrder: string;
}

const EMPTY_SECTION: SectionFormState = {
  name: "",
  color: "",
  sortOrder: "0",
};

function rowToForm(row: SectionRow): SectionFormState {
  return {
    name: row.name,
    color: row.color ?? "",
    sortOrder: String(row.sortOrder),
  };
}

interface Props {
  restaurantId: string;
  organizationId: string;
  sections: SectionRow[];
}

export function SectionsManager({ restaurantId, organizationId, sections }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<SectionFormState>(EMPTY_SECTION);

  const beginCreate = () => {
    setError(null);
    setEditing("new");
    setForm(EMPTY_SECTION);
  };

  const beginEdit = (row: SectionRow) => {
    setError(null);
    setEditing(row.id);
    setForm(rowToForm(row));
  };

  const cancel = () => {
    setError(null);
    setEditing(null);
    setForm(EMPTY_SECTION);
  };

  const submitCreate = () => {
    setError(null);
    if (!form.name.trim()) {
      setError("Numele secțiunii este obligatoriu.");
      return;
    }
    start(async () => {
      const res = await createSectionAction({
        restaurantId,
        organizationId,
        name: form.name.trim(),
        color: form.color || undefined,
        sortOrder: parseInt(form.sortOrder, 10) || 0,
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
      setError("Numele secțiunii este obligatoriu.");
      return;
    }
    const section = sections.find((s) => s.id === id);
    if (!section) return;
    start(async () => {
      const res = await updateSectionAction({
        id,
        restaurantId: section.restaurantId,
        organizationId,
        changes: {
          name: form.name.trim(),
          color: form.color || undefined,
          sortOrder: parseInt(form.sortOrder, 10) || 0,
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      cancel();
      router.refresh();
    });
  };

  const handleDelete = (row: SectionRow) => {
    if (
      !confirm(
        `Ștergi secțiunea „${row.name}"? Mesele din ea rămân intacte, dar pierd asocierea cu secțiunea.`,
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const res = await archiveSectionAction({
        id: row.id,
        restaurantId: row.restaurantId,
        organizationId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="bg-surface-white rounded-card border border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-display text-base font-bold text-text-primary">
          Secțiuni ({sections.length})
        </span>
        {expanded ? (
          <ChevronUp size={16} className="text-text-secondary" />
        ) : (
          <ChevronDown size={16} className="text-text-secondary" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-5 pb-5 pt-4 space-y-3">
          {error && (
            <p
              className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              role="alert"
            >
              {error}
            </p>
          )}

          {sections.map((row) =>
            editing === row.id ? (
              <SectionForm
                key={row.id}
                form={form}
                setForm={setForm}
                onCancel={cancel}
                onSubmit={() => submitUpdate(row.id)}
                submitLabel="Salvează"
                pending={pending}
              />
            ) : (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {row.color && (
                    <span
                      className="inline-block w-3.5 h-3.5 rounded-full shrink-0 border border-border"
                      style={{ backgroundColor: row.color }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-sm font-medium text-text-primary truncate">
                    {row.name}
                  </span>
                  <span className="text-xs text-text-muted">#{row.sortOrder}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => beginEdit(row)}
                    disabled={pending}
                    aria-label={`Editează ${row.name}`}
                    className="p-2 rounded-lg text-text-secondary hover:bg-surface-bg disabled:opacity-50"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(row)}
                    disabled={pending}
                    aria-label={`Șterge ${row.name}`}
                    className="p-2 rounded-lg text-text-secondary hover:bg-red-50 hover:text-error disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ),
          )}

          {editing === "new" ? (
            <SectionForm
              form={form}
              setForm={setForm}
              onCancel={cancel}
              onSubmit={submitCreate}
              submitLabel="Adaugă"
              pending={pending}
            />
          ) : (
            <div className="pt-1">
              <Button variant="secondary" onClick={beginCreate} disabled={pending}>
                <span className="inline-flex items-center gap-2">
                  <Plus size={14} />
                  Secțiune nouă
                </span>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionForm({
  form,
  setForm,
  onCancel,
  onSubmit,
  submitLabel,
  pending,
}: {
  form: SectionFormState;
  setForm: (next: SectionFormState) => void;
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
      className="rounded-lg border border-brand-primary/30 bg-orange-50/30 px-4 py-3 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block col-span-2">
          <span className="text-sm font-medium text-text-primary">Nume secțiune</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={60}
            required
            autoFocus
            placeholder="Ex. Terasă, Sală principală"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary bg-white"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            Culoare <span className="text-text-muted">(#hex, op.)</span>
          </span>
          <input
            type="text"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            maxLength={7}
            placeholder="#aabbcc"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary bg-white"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-text-primary">Ordine</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary bg-white"
          />
        </label>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Anulează
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Se salvează…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
