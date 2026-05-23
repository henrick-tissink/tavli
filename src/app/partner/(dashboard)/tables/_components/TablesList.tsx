"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Archive, Users, Grid3x3 } from "lucide-react";
import { Button } from "@/components/button";
import { archiveTableAction } from "../actions";
import { AddTableModal } from "./AddTableModal";
import { EditTableModal } from "./EditTableModal";
import type { TableRow } from "./EditTableModal";

interface Section {
  id: string;
  name: string;
}

interface GroupedSection {
  id: string | null;
  name: string;
  tables: TableRow[];
}

interface Props {
  restaurantId: string;
  organizationId: string;
  sections: (Section & { restaurantId: string; organizationId: string; color: string | null; sortOrder: number })[];
  tables: TableRow[];
}

const SHAPE_LABELS: Record<string, string> = {
  round: "Rotund",
  square: "Pătrat",
  rect_2x4: "Dreptunghi 2×4",
  rect_2x6: "Dreptunghi 2×6",
  rect_2x8: "Dreptunghi 2×8",
  banquette: "Banchetă",
  bar_stool: "Taburet bar",
  high_top: "High-top",
  patio: "Terasă",
};

export function TablesList({ restaurantId, organizationId, sections, tables }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Group tables by section
  const grouped: GroupedSection[] = [];

  // Sections that have tables
  const sectionIds = sections.map((s) => s.id);
  for (const section of sections) {
    const sectionTables = tables.filter((t) => t.sectionId === section.id);
    if (sectionTables.length > 0) {
      grouped.push({ id: section.id, name: section.name, tables: sectionTables });
    }
  }

  // Unsectioned tables
  const unsectioned = tables.filter(
    (t) => !t.sectionId || !sectionIds.includes(t.sectionId),
  );
  if (unsectioned.length > 0) {
    grouped.push({ id: null, name: "Fără secțiune", tables: unsectioned });
  }

  // Empty tables list
  if (sections.length === 0) {
    grouped.push({ id: null, name: "Fără secțiune", tables: [] });
  }

  function handleArchive(table: TableRow) {
    if (
      !confirm(
        `Arhivezi masa „${table.label}"? Va dispărea din plan, dar istoricul rezervărilor rămâne intact.`,
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const res = await archiveTableAction({
        id: table.id,
        restaurantId: table.restaurantId,
        organizationId: table.organizationId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const sectionProps: Section[] = sections.map((s) => ({ id: s.id, name: s.name }));

  return (
    <>
      {addOpen && (
        <AddTableModal
          restaurantId={restaurantId}
          organizationId={organizationId}
          sections={sectionProps}
          onClose={() => setAddOpen(false)}
        />
      )}
      {editingTable && (
        <EditTableModal
          table={editingTable}
          sections={sectionProps}
          onClose={() => setEditingTable(null)}
        />
      )}

      {error && (
        <p
          className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4"
          role="alert"
        >
          {error}
        </p>
      )}

      {tables.length === 0 && (
        <div className="bg-surface-white rounded-card border border-border p-10 text-center mb-6">
          <Grid3x3 size={32} className="text-text-muted mx-auto mb-3" />
          <p className="font-semibold text-text-primary">Nicio masă adăugată încă</p>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed max-w-sm mx-auto">
            Adaugă mesele restaurantului pentru a gestiona planul de sală și
            rezervările pe masă.
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => setAddOpen(true)} disabled={pending}>
              <span className="inline-flex items-center gap-2">
                <Plus size={16} />
                Adaugă prima masă
              </span>
            </Button>
          </div>
        </div>
      )}

      {grouped.map((group) => (
        <section key={group.id ?? "__unsectioned__"} className="mb-6">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3 px-1">
            {group.name}
            <span className="ml-2 normal-case font-normal">
              ({group.tables.length} {group.tables.length === 1 ? "masă" : "mese"})
            </span>
          </h2>

          {group.tables.length === 0 && (
            <div className="bg-surface-white rounded-card border border-border border-dashed p-5 text-center text-sm text-text-muted">
              Nicio masă în această secțiune
            </div>
          )}

          {group.tables.length > 0 && (
            <div className="bg-surface-white rounded-card border border-border divide-y divide-border">
              {group.tables.map((table) => (
                <article
                  key={table.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="flex-none">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-brand-primary-soft text-brand-primary font-display font-bold text-sm">
                        {table.label}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-text-primary text-sm">
                          {SHAPE_LABELS[table.shape] ?? table.shape}
                        </span>
                        {table.isProOnly && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                            PRO
                          </span>
                        )}
                        {!table.isBookableOnline && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-bg text-text-muted">
                            Offline
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-text-secondary mt-0.5">
                        <Users size={13} />
                        {table.capacityMin === table.capacityMax
                          ? `${table.capacityMin} pers.`
                          : `${table.capacityMin}–${table.capacityMax} pers.`}
                        {table.capacityTypical != null && (
                          <span className="text-text-muted text-xs ml-1">
                            (tipic {table.capacityTypical})
                          </span>
                        )}
                      </div>
                      {table.description && (
                        <p className="text-xs text-text-muted mt-1 truncate">
                          {table.description}
                        </p>
                      )}
                    </div>

                    <div className="text-xs text-text-muted tabular-nums shrink-0 hidden desktop:block">
                      ({table.positionX}, {table.positionY}) {table.width}×{table.height}px
                      {table.rotationDegrees !== 0 && ` ${table.rotationDegrees}°`}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingTable(table)}
                      disabled={pending}
                      aria-label={`Editează masa ${table.label}`}
                      className="p-2 rounded-lg text-text-secondary hover:bg-surface-bg disabled:opacity-50"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchive(table)}
                      disabled={pending}
                      aria-label={`Arhivează masa ${table.label}`}
                      className="p-2 rounded-lg text-text-secondary hover:bg-red-50 hover:text-error disabled:opacity-50"
                    >
                      <Archive size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}

      {tables.length > 0 && (
        <div className="mt-2">
          <Button variant="secondary" onClick={() => setAddOpen(true)} disabled={pending}>
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              Adaugă masă
            </span>
          </Button>
        </div>
      )}
    </>
  );
}
