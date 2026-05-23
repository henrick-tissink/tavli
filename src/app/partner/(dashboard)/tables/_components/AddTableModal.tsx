"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/button";
import { createTableAction } from "../actions";
import type { CreateTableInput } from "@/lib/tables/actions";

const TABLE_SHAPES = [
  { value: "round", label: "Rotund" },
  { value: "square", label: "Pătrat" },
  { value: "rect_2x4", label: "Dreptunghi 2×4" },
  { value: "rect_2x6", label: "Dreptunghi 2×6" },
  { value: "rect_2x8", label: "Dreptunghi 2×8" },
  { value: "banquette", label: "Banchetă" },
  { value: "bar_stool", label: "Taburet bar" },
  { value: "high_top", label: "High-top" },
  { value: "patio", label: "Terasă" },
] as const;

interface Section {
  id: string;
  name: string;
}

interface Props {
  restaurantId: string;
  organizationId: string;
  sections: Section[];
  onClose: () => void;
}

interface FormState {
  label: string;
  description: string;
  capacityMin: string;
  capacityMax: string;
  capacityTypical: string;
  shape: string;
  sectionId: string;
  positionX: string;
  positionY: string;
  width: string;
  height: string;
  rotationDegrees: string;
  isBookableOnline: boolean;
  isProOnly: boolean;
}

const EMPTY: FormState = {
  label: "",
  description: "",
  capacityMin: "2",
  capacityMax: "4",
  capacityTypical: "",
  shape: "round",
  sectionId: "",
  positionX: "0",
  positionY: "0",
  width: "100",
  height: "100",
  rotationDegrees: "0",
  isBookableOnline: true,
  isProOnly: false,
};

export function AddTableModal({ restaurantId, organizationId, sections, onClose }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function field(key: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    if (!form.label.trim()) {
      setError("Eticheta mesei este obligatorie.");
      return false;
    }
    const min = parseInt(form.capacityMin, 10);
    const max = parseInt(form.capacityMax, 10);
    if (!Number.isFinite(min) || min < 1) {
      setError("Capacitatea minimă trebuie să fie un număr pozitiv.");
      return false;
    }
    if (!Number.isFinite(max) || max < 1) {
      setError("Capacitatea maximă trebuie să fie un număr pozitiv.");
      return false;
    }
    if (min > max) {
      setError("Capacitatea minimă nu poate depăși capacitatea maximă.");
      return false;
    }
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    start(async () => {
      const res = await createTableAction({
        restaurantId,
        organizationId,
        label: form.label.trim(),
        description: form.description.trim() || undefined,
        capacityMin: parseInt(form.capacityMin, 10),
        capacityMax: parseInt(form.capacityMax, 10),
        capacityTypical: form.capacityTypical ? parseInt(form.capacityTypical, 10) : undefined,
        shape: form.shape as CreateTableInput["shape"],
        sectionId: form.sectionId || undefined,
        positionX: parseInt(form.positionX, 10) || 0,
        positionY: parseInt(form.positionY, 10) || 0,
        width: parseInt(form.width, 10) || 100,
        height: parseInt(form.height, 10) || 100,
        rotationDegrees: parseInt(form.rotationDegrees, 10) || 0,
        isBookableOnline: form.isBookableOnline,
        isProOnly: form.isProOnly,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative w-full max-w-lg bg-surface-white rounded-card border border-border shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface-white z-10">
          <h2 className="font-display text-xl font-bold text-text-primary">Adaugă masă</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-bg"
            aria-label="Închide"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <p className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <label className="block col-span-1">
              <span className="text-sm font-medium text-text-primary">Etichetă masă</span>
              <input
                type="text"
                value={form.label}
                onChange={(e) => field("label", e.target.value)}
                maxLength={20}
                required
                placeholder="Ex. T1, M5, Bar-3"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              />
            </label>

            <label className="block col-span-1">
              <span className="text-sm font-medium text-text-primary">Formă</span>
              <select
                value={form.shape}
                onChange={(e) => field("shape", e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary bg-white"
              >
                {TABLE_SHAPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-text-primary">Cap. min</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={form.capacityMin}
                onChange={(e) => field("capacityMin", e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-text-primary">Cap. max</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={form.capacityMax}
                onChange={(e) => field("capacityMax", e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-text-primary">
                Cap. tipică <span className="text-text-muted">(op.)</span>
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={form.capacityTypical}
                onChange={(e) => field("capacityTypical", e.target.value)}
                placeholder="—"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              />
            </label>
          </div>

          {sections.length > 0 && (
            <label className="block">
              <span className="text-sm font-medium text-text-primary">
                Secțiune <span className="text-text-muted">(opțional)</span>
              </span>
              <select
                value={form.sectionId}
                onChange={(e) => field("sectionId", e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary bg-white"
              >
                <option value="">— Fără secțiune —</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-sm font-medium text-text-primary">
              Descriere <span className="text-text-muted">(opțional)</span>
            </span>
            <textarea
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Note despre amplasare, vedere etc."
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary resize-y"
            />
          </label>

          <div>
            <p className="text-sm font-medium text-text-primary mb-2">Poziție pe plan</p>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-text-secondary">X (px)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.positionX}
                  onChange={(e) => field("positionX", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
              </label>
              <label className="block">
                <span className="text-xs text-text-secondary">Y (px)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.positionY}
                  onChange={(e) => field("positionY", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
              </label>
              <label className="block">
                <span className="text-xs text-text-secondary">Lățime (px)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={10}
                  value={form.width}
                  onChange={(e) => field("width", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
              </label>
              <label className="block">
                <span className="text-xs text-text-secondary">Înălțime (px)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={10}
                  value={form.height}
                  onChange={(e) => field("height", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
              </label>
            </div>
            <label className="block mt-3">
              <span className="text-xs text-text-secondary">Rotație (grade)</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={359}
                value={form.rotationDegrees}
                onChange={(e) => field("rotationDegrees", e.target.value)}
                className="mt-1 w-32 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isBookableOnline}
                onChange={(e) => field("isBookableOnline", e.target.checked)}
                className="h-4 w-4 rounded border-border text-brand-primary focus:ring-brand-primary/30"
              />
              <span className="text-sm text-text-primary">Rezervabilă online</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isProOnly}
                onChange={(e) => field("isProOnly", e.target.checked)}
                className="h-4 w-4 rounded border-border text-brand-primary focus:ring-brand-primary/30"
              />
              <span className="text-sm text-text-primary">Doar abonament Pro</span>
            </label>
          </div>

          <div className="flex items-center gap-2 justify-end pt-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Anulează
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Se salvează…" : "Adaugă masă"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
