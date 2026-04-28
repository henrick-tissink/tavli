"use client";

import { useState, useTransition } from "react";
import { X, Star } from "lucide-react";
import { Button } from "@/components/button";
import {
  saveItem,
  type SaveItemPayload,
} from "@/app/partner/(dashboard)/menu/actions";

export interface EditableItem {
  id?: string;
  sectionId: string;
  name: string;
  description: string;
  priceLei: number;
  dietaryTags: string[];
  isChefPick: boolean;
  isAvailable: boolean;
}

const TAG_OPTIONS: { value: string; label: string; icon?: string }[] = [
  { value: "vegetarian", label: "Vegetarian", icon: "🥬" },
  { value: "vegan", label: "Vegan", icon: "🌱" },
  { value: "gluten_free", label: "Gluten-free", icon: "🌾" },
  { value: "spicy", label: "Spicy", icon: "🌶" },
  { value: "popular", label: "Popular", icon: "🔥" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  item: EditableItem;
}

function parsePrice(input: string): number {
  if (input.trim() === "") return 0;
  const n = Number(input.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function ItemDialog({ open, onClose, onSaved, item }: Props) {
  const [state, setState] = useState<EditableItem>(item);
  const [priceInput, setPriceInput] = useState<string>(
    item.priceLei > 0 ? String(item.priceLei) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) return null;

  const toggleTag = (t: string) => {
    setState((s) => ({
      ...s,
      dietaryTags: s.dietaryTags.includes(t)
        ? s.dietaryTags.filter((x) => x !== t)
        : [...s.dietaryTags, t],
    }));
  };

  const handleSave = () => {
    start(async () => {
      const payload: SaveItemPayload = {
        ...state,
        priceLei: parsePrice(priceInput),
      };
      const result = await saveItem(payload);
      if (!result.ok) {
        setError(result.error ?? "Failed to save.");
      } else {
        setError(null);
        onSaved();
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div className="relative bg-surface-white rounded-card shadow-modal max-w-xl w-full max-h-[92vh] overflow-y-auto">
        <header className="px-6 py-5 border-b border-border flex items-center justify-between sticky top-0 bg-surface-white">
          <h2 className="font-display text-xl font-bold">
            {state.id ? "Edit dish" : "New dish"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-bg"
          >
            <X size={18} />
          </button>
        </header>
        <div className="px-6 py-5 space-y-5">
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="item-name">
              Name
            </label>
            <input
              id="item-name"
              type="text"
              value={state.name}
              onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
              placeholder="Spaghetti alla Carbonara"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="item-description">
              Description
            </label>
            <textarea
              id="item-description"
              value={state.description}
              onChange={(e) =>
                setState((s) => ({ ...s, description: e.target.value }))
              }
              rows={3}
              placeholder="Guanciale, pecorino romano, egg yolk, black pepper."
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="item-price">
                Price (lei)
              </label>
              <input
                id="item-price"
                type="text"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.isAvailable}
                  onChange={(e) =>
                    setState((s) => ({ ...s, isAvailable: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-border accent-[var(--color-brand-primary)]"
                />
                Available on menu
              </label>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Tags</p>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map((t) => {
                const active = state.dietaryTags.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleTag(t.value)}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-pill text-xs font-semibold border transition-colors ${
                      active
                        ? "bg-brand-primary-soft text-brand-primary-dark border-brand-primary/30"
                        : "bg-surface-white text-text-secondary border-border hover:bg-surface-bg"
                    }`}
                  >
                    {t.icon && <span>{t.icon}</span>}
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={state.isChefPick}
              onChange={(e) =>
                setState((s) => ({ ...s, isChefPick: e.target.checked }))
              }
              className="h-4 w-4 rounded border-border accent-[var(--color-brand-primary)]"
            />
            <Star
              size={14}
              className={
                state.isChefPick
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-text-muted"
              }
            />
            Chef&apos;s pick
          </label>

          {error && (
            <p className="text-sm text-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="px-6 py-4 border-t border-border flex items-center justify-end gap-3 sticky bottom-0 bg-surface-white">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending} type="button">
            {pending ? "Saving…" : state.id ? "Save changes" : "Add dish"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
