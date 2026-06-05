"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Star, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import { ItemDialog, type EditableItem, type ItemTranslations } from "./ItemDialog";
import {
  createSection,
  deleteSection,
  deleteItem,
  updateSection,
} from "@/app/(app)/partner/(dashboard)/menu/actions";

export interface SectionTranslations {
  en: { name: string; intro: string };
  de: { name: string; intro: string };
}

const emptySectionTranslations = (): SectionTranslations => ({
  en: { name: "", intro: "" },
  de: { name: "", intro: "" },
});

export interface MenuSectionData {
  id: string;
  name: string;
  intro: string | null;
  sortOrder: number;
  translations: SectionTranslations;
  items: {
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    dietaryTags: string[];
    isChefPick: boolean;
    isAvailable: boolean;
    sortOrder: number;
    photoUrl: string | null;
    translations: ItemTranslations;
  }[];
}

export function MenuEditor({
  sections,
  restaurantId,
}: {
  sections: MenuSectionData[];
  restaurantId: string;
}) {
  const t = useT("partner.menu");
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(sections.length > 0 ? [sections[0]!.id] : []),
  );
  const [editingSection, setEditingSection] = useState<{
    id: string;
    name: string;
    intro: string;
    translations: SectionTranslations;
  } | null>(null);
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
    if (!confirm(t("editor.confirmDeleteSection", { name }))) return;
    start(async () => {
      await deleteSection(id);
      router.refresh();
    });
  };

  const handleDeleteItem = (id: string, name: string) => {
    if (!confirm(t("editor.confirmDeleteItem", { name }))) return;
    start(async () => {
      await deleteItem(id);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {sections.length === 0 && !newSectionForm && (
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">{t("editor.emptyTitle")}</p>
          <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
            {t("editor.emptyBody1")}
          </p>
          <Button onClick={() => setNewSectionForm(true)} type="button" className="mt-6">
            <span className="inline-flex items-center gap-2"><Plus size={14} /> {t("editor.addFirstSection")}</span>
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
                aria-label={isOpen ? t("editor.collapse") : t("editor.expand")}
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
                {t("editor.itemCount", { count: section.items.length })}
              </span>
              <button
                type="button"
                onClick={() =>
                  setEditingSection({
                    id: section.id,
                    name: section.name,
                    intro: section.intro ?? "",
                    translations: section.translations,
                  })
                }
                aria-label={t("editor.editSection")}
                className="p-2 rounded-lg hover:bg-surface-bg"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSection(section.id, section.name)}
                aria-label={t("editor.deleteSection")}
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
                              {t("editor.unavailable")}
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
                          {it.dietaryTags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800"
                            >
                              {tag.replace("_", "-")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-sm text-brand-primary whitespace-nowrap">
                      {t("editor.price", { amount: (it.priceCents / 100).toFixed(0) })}
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
                            photoUrl: it.photoUrl,
                            translations: it.translations,
                          },
                        })
                      }
                      aria-label={t("editor.editItem")}
                      className="p-1.5 rounded-lg hover:bg-surface-white"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(it.id, it.name)}
                      aria-label={t("editor.deleteItem")}
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
                  {t("editor.addItem")}
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
          initial={{ id: "", name: "", intro: "", translations: emptySectionTranslations() }}
          onClose={() => setNewSectionForm(false)}
          onSaved={() => {
            setNewSectionForm(false);
            router.refresh();
          }}
        />
      ) : (
        sections.length > 0 && (
          <Button variant="secondary" onClick={() => setNewSectionForm(true)}>
            <span className="inline-flex items-center gap-2"><Plus size={14} /> {t("editor.addSection")}</span>
          </Button>
        )
      )}

      {/* Keyed + conditionally mounted so the dialog re-seeds its form state
          from the clicked dish. ItemDialog reads `item` via useState(item),
          which only runs on mount — without remounting, edits would always
          show the first/blank item. */}
      {itemDialog.open && (
        <ItemDialog
          key={itemDialog.item.id ?? "new"}
          open
          onClose={() => setItemDialog((d) => ({ ...d, open: false }))}
          onSaved={() => router.refresh()}
          item={itemDialog.item}
          restaurantId={restaurantId}
        />
      )}
    </div>
  );
}

function SectionEditorDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: { id: string; name: string; intro: string; translations?: SectionTranslations };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("partner.menu");
  const [name, setName] = useState(initial.name);
  const [intro, setIntro] = useState(initial.intro);
  const [tr, setTr] = useState<SectionTranslations>(
    initial.translations ?? emptySectionTranslations(),
  );
  const [trOpen, setTrOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isNew = !initial.id;

  const handleSave = () => {
    start(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("intro", intro);
      for (const loc of ["en", "de"] as const) {
        fd.set(`name_${loc}`, tr[loc].name);
        fd.set(`intro_${loc}`, tr[loc].intro);
      }
      const result = isNew
        ? await createSection(fd)
        : await updateSection(initial.id, fd);
      if (!result.ok) {
        setError(result.error ?? t("sectionDialog.genericError"));
      } else {
        onSaved();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("sectionDialog.close")}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div className="relative bg-surface-white rounded-card shadow-modal max-w-md w-full p-6">
        <h2 className="font-display text-xl font-bold mb-4">
          {isNew ? t("sectionDialog.titleNew") : t("sectionDialog.titleEdit")}
        </h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium">{t("sectionDialog.nameLabel")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("sectionDialog.namePlaceholder")}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">{t("sectionDialog.introLabel")}</label>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={2}
              placeholder={t("sectionDialog.introPlaceholder")}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
            />
          </div>
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setTrOpen((o) => !o)}
              className="flex items-center gap-1.5 text-sm font-semibold text-text-primary"
            >
              {trOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              {t("sectionDialog.translations.heading")}
            </button>
            {trOpen && (
              <div className="mt-3 space-y-3">
                {(["en", "de"] as const).map((loc) => {
                  const localeName =
                    loc === "en"
                      ? t("sectionDialog.translations.english")
                      : t("sectionDialog.translations.german");
                  return (
                    <div key={loc} className="space-y-2 rounded-lg bg-surface-bg p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                        {localeName}
                      </p>
                      <input
                        type="text"
                        aria-label={`${localeName} — ${t("sectionDialog.translations.nameLabel")}`}
                        placeholder={t("sectionDialog.translations.nameLabel")}
                        value={tr[loc].name}
                        onChange={(e) =>
                          setTr((s) => ({ ...s, [loc]: { ...s[loc], name: e.target.value } }))
                        }
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      />
                      <textarea
                        aria-label={`${localeName} — ${t("sectionDialog.translations.introLabel")}`}
                        placeholder={t("sectionDialog.translations.introLabel")}
                        rows={2}
                        value={tr[loc].intro}
                        onChange={(e) =>
                          setTr((s) => ({ ...s, [loc]: { ...s[loc], intro: e.target.value } }))
                        }
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} type="button">
            {t("sectionDialog.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={pending} type="button">
            {pending
              ? t("sectionDialog.saving")
              : isNew
                ? t("sectionDialog.create")
                : t("sectionDialog.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
