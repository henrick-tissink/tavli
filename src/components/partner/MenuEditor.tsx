"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Star, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/button";
import { ItemDialog, type EditableItem } from "./ItemDialog";
import {
  createSection,
  deleteSection,
  deleteItem,
  updateSection,
} from "@/app/partner/(dashboard)/menu/actions";

export interface MenuSectionData {
  id: string;
  name: string;
  intro: string | null;
  sortOrder: number;
  items: {
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    dietaryTags: string[];
    isChefPick: boolean;
    isAvailable: boolean;
    sortOrder: number;
  }[];
}

export function MenuEditor({ sections }: { sections: MenuSectionData[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(sections.length > 0 ? [sections[0]!.id] : []),
  );
  const [editingSection, setEditingSection] = useState<{ id: string; name: string; intro: string } | null>(null);
  const [newSectionForm, setNewSectionForm] = useState(false);
  const [itemDialog, setItemDialog] = useState<{
    open: boolean;
    item: EditableItem;
  }>({
    open: false,
    item: {
      sectionId: "",
      name: "",
      description: "",
      priceLei: 0,
      dietaryTags: [],
      isChefPick: false,
      isAvailable: true,
    },
  });
  const [pending, start] = useTransition();

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSection = (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and all its items?`)) return;
    start(async () => {
      await deleteSection(id);
      router.refresh();
    });
  };

  const handleDeleteItem = (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    start(async () => {
      await deleteItem(id);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {sections.length === 0 && !newSectionForm && (
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">No sections yet</p>
          <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
            Start with a section like &ldquo;Starters&rdquo; or
            &ldquo;Antipasti&rdquo;, then add dishes to it.
          </p>
          <Button onClick={() => setNewSectionForm(true)} type="button" className="mt-6">
            <span className="inline-flex items-center gap-2"><Plus size={14} /> Add first section</span>
          </Button>
        </div>
      )}

      {sections.map((section) => {
        const isOpen = expanded.has(section.id);
        return (
          <div
            key={section.id}
            className="bg-surface-white rounded-card border border-border overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggle(section.id)}
                aria-label={isOpen ? "Collapse" : "Expand"}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-surface-bg"
              >
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-lg font-bold text-text-primary truncate">
                  {section.name}
                </h3>
                {section.intro && (
                  <p className="text-xs italic text-text-secondary truncate">
                    {section.intro}
                  </p>
                )}
              </div>
              <span className="text-xs text-text-muted">
                {section.items.length} item{section.items.length !== 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={() =>
                  setEditingSection({
                    id: section.id,
                    name: section.name,
                    intro: section.intro ?? "",
                  })
                }
                aria-label="Edit section"
                className="p-2 rounded-lg hover:bg-surface-bg"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSection(section.id, section.name)}
                aria-label="Delete section"
                disabled={pending}
                className="p-2 rounded-lg hover:bg-red-50 hover:text-red-700 text-text-muted"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {isOpen && (
              <div className="px-5 py-3 space-y-2">
                {section.items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-surface-bg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        {it.isChefPick && (
                          <Star size={14} className="fill-yellow-400 text-yellow-400 mt-0.5 flex-shrink-0" />
                        )}
                        <p className="font-semibold text-sm text-text-primary">
                          {it.name}
                          {!it.isAvailable && (
                            <span className="ml-2 text-xs font-normal text-text-muted italic">
                              (not available)
                            </span>
                          )}
                        </p>
                      </div>
                      {it.description && (
                        <p className="text-xs italic text-text-secondary mt-0.5 line-clamp-2">
                          {it.description}
                        </p>
                      )}
                      {it.dietaryTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {it.dietaryTags.map((t) => (
                            <span
                              key={t}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800"
                            >
                              {t.replace("_", "-")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-sm text-brand-primary whitespace-nowrap">
                      {(it.priceCents / 100).toFixed(0)} lei
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setItemDialog({
                          open: true,
                          item: {
                            id: it.id,
                            sectionId: section.id,
                            name: it.name,
                            description: it.description ?? "",
                            priceLei: it.priceCents / 100,
                            dietaryTags: it.dietaryTags,
                            isChefPick: it.isChefPick,
                            isAvailable: it.isAvailable,
                          },
                        })
                      }
                      aria-label="Edit item"
                      className="p-1.5 rounded-lg hover:bg-surface-white"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(it.id, it.name)}
                      aria-label="Delete item"
                      disabled={pending}
                      className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-700 text-text-muted"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setItemDialog({
                      open: true,
                      item: {
                        sectionId: section.id,
                        name: "",
                        description: "",
                        priceLei: 0,
                        dietaryTags: [],
                        isChefPick: false,
                        isAvailable: true,
                      },
                    })
                  }
                  className="flex items-center gap-2 w-full py-2 px-3 rounded-lg text-sm text-brand-primary font-semibold hover:bg-brand-primary-soft/50"
                >
                  <Plus size={14} />
                  Add dish
                </button>
              </div>
            )}
          </div>
        );
      })}

      {editingSection && (
        <SectionEditorDialog
          initial={editingSection}
          onClose={() => setEditingSection(null)}
          onSaved={() => {
            setEditingSection(null);
            router.refresh();
          }}
        />
      )}

      {newSectionForm ? (
        <SectionEditorDialog
          initial={{ id: "", name: "", intro: "" }}
          onClose={() => setNewSectionForm(false)}
          onSaved={() => {
            setNewSectionForm(false);
            router.refresh();
          }}
        />
      ) : (
        sections.length > 0 && (
          <Button variant="secondary" onClick={() => setNewSectionForm(true)}>
            <span className="inline-flex items-center gap-2"><Plus size={14} /> Add section</span>
          </Button>
        )
      )}

      <ItemDialog
        open={itemDialog.open}
        onClose={() => setItemDialog((d) => ({ ...d, open: false }))}
        onSaved={() => router.refresh()}
        item={itemDialog.item}
      />
    </div>
  );
}

function SectionEditorDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: { id: string; name: string; intro: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [intro, setIntro] = useState(initial.intro);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isNew = !initial.id;

  const handleSave = () => {
    start(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("intro", intro);
      const result = isNew
        ? await createSection(fd)
        : await updateSection(initial.id, fd);
      if (!result.ok) {
        setError(result.error ?? "Failed.");
      } else {
        onSaved();
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
      <div className="relative bg-surface-white rounded-card shadow-modal max-w-md w-full p-6">
        <h2 className="font-display text-xl font-bold mb-4">
          {isNew ? "New section" : "Edit section"}
        </h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Starters · Primi · Antipasti"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Intro (optional)</label>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={2}
              placeholder="Small plates to share while the primi is still cooking."
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending} type="button">
            {pending ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
