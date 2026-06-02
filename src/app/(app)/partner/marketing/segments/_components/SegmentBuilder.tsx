"use client";

/**
 * §11 v1.5 — visual segment builder over the 5 compileSegmentFilter dimensions.
 * Builds a condition list, previews the matching diner count, and saves a
 * reusable marketing_segments row.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/toast";
import { useT } from "@/lib/i18n/messages-provider";
import type { SegmentCondition, Combinator } from "@/lib/marketing/segment-compile";
import { previewSegmentSizeAction, saveSegmentAction } from "../../actions";

type Dimension = SegmentCondition["dimension"];

const DIMENSION_VALUES: Dimension[] = [
  "recency",
  "frequency",
  "party_size",
  "occasion",
  "channel",
];

interface Row {
  dimension: Dimension;
  // loosely-typed working values; serialised to SegmentCondition on submit
  recencyMode: "within" | "notWithin";
  days: string;
  bucket: string;
  min: string;
  max: string;
  tag: string;
  source: string;
}

const blankRow = (): Row => ({
  dimension: "recency",
  recencyMode: "within",
  days: "30",
  bucket: "",
  min: "",
  max: "",
  tag: "",
  source: "",
});

function toCondition(r: Row): SegmentCondition {
  switch (r.dimension) {
    case "recency":
      return r.recencyMode === "notWithin"
        ? { dimension: "recency", notWithinDays: Number(r.days) || 0 }
        : { dimension: "recency", withinDays: Number(r.days) || 0 };
    case "frequency":
      return { dimension: "frequency", bucket: r.bucket.trim() };
    case "party_size":
      return {
        dimension: "party_size",
        ...(r.min ? { min: Number(r.min) } : {}),
        ...(r.max ? { max: Number(r.max) } : {}),
      };
    case "occasion":
      return { dimension: "occasion", tag: r.tag.trim() };
    case "channel":
      return { dimension: "channel", source: r.source.trim() };
  }
}

export function SegmentBuilder({ organizationId }: { organizationId: string }) {
  const t = useT("partner.marketing");
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [combinator, setCombinator] = useState<Combinator>("and");
  const [name, setName] = useState("");
  const [size, setSize] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const inputCls =
    "rounded-button border border-border bg-surface-white px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30";

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSize(null);
  }

  function preview() {
    startTransition(async () => {
      const res = await previewSegmentSizeAction(organizationId, rows.map(toCondition), combinator);
      if (res.ok) setSize(res.data.count);
      else toast.error(res.code === "invalid_input" ? t("builder.errorPreviewInvalid") : t("builder.errorPreviewGeneric"));
    });
  }

  function save() {
    startTransition(async () => {
      const res = await saveSegmentAction(organizationId, name, rows.map(toCondition), combinator);
      if (res.ok) {
        toast.success(t("builder.saved"));
        setName("");
        router.refresh();
      } else {
        toast.error(res.code === "invalid_input" ? t("builder.errorSaveInvalid") : t("builder.errorSaveGeneric"));
      }
    });
  }

  return (
    <div className="rounded-card border border-border bg-surface-white p-5">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        {t("builder.matchPrefix")}
        <select
          value={combinator}
          onChange={(e) => { setCombinator(e.target.value as Combinator); setSize(null); }}
          className={inputCls}
          aria-label={t("builder.combinatorAriaLabel")}
        >
          <option value="and">{t("builder.combinatorAll")}</option>
          <option value="or">{t("builder.combinatorAny")}</option>
        </select>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-button bg-surface-bg p-3">
            <select
              value={r.dimension}
              onChange={(e) => update(i, { dimension: e.target.value as Dimension })}
              className={inputCls}
              aria-label={t("builder.dimensionAriaLabel")}
            >
              {DIMENSION_VALUES.map((d) => (
                <option key={d} value={d}>{t(`builder.dimensions.${d}`)}</option>
              ))}
            </select>

            {r.dimension === "recency" && (
              <>
                <select value={r.recencyMode} onChange={(e) => update(i, { recencyMode: e.target.value as Row["recencyMode"] })} className={inputCls} aria-label={t("builder.recencyModeAriaLabel")}>
                  <option value="within">{t("builder.recencyWithin")}</option>
                  <option value="notWithin">{t("builder.recencyNotWithin")}</option>
                </select>
                <input type="number" min={1} value={r.days} onChange={(e) => update(i, { days: e.target.value })} className={`${inputCls} w-20`} aria-label={t("builder.daysAriaLabel")} />
                <span className="text-sm text-text-secondary">{t("builder.daysSuffix")}</span>
              </>
            )}
            {r.dimension === "frequency" && (
              <input value={r.bucket} onChange={(e) => update(i, { bucket: e.target.value })} placeholder={t("builder.bucketPlaceholder")} className={inputCls} aria-label={t("builder.bucketAriaLabel")} />
            )}
            {r.dimension === "party_size" && (
              <>
                <input type="number" min={1} value={r.min} onChange={(e) => update(i, { min: e.target.value })} placeholder={t("builder.minPlaceholder")} className={`${inputCls} w-20`} aria-label={t("builder.minAriaLabel")} />
                <input type="number" min={1} value={r.max} onChange={(e) => update(i, { max: e.target.value })} placeholder={t("builder.maxPlaceholder")} className={`${inputCls} w-20`} aria-label={t("builder.maxAriaLabel")} />
              </>
            )}
            {r.dimension === "occasion" && (
              <input value={r.tag} onChange={(e) => update(i, { tag: e.target.value })} placeholder={t("builder.tagPlaceholder")} className={inputCls} aria-label={t("builder.tagAriaLabel")} />
            )}
            {r.dimension === "channel" && (
              <input value={r.source} onChange={(e) => update(i, { source: e.target.value })} placeholder={t("builder.sourcePlaceholder")} className={inputCls} aria-label={t("builder.sourceAriaLabel")} />
            )}

            {rows.length > 1 && (
              <button type="button" onClick={() => { setRows((p) => p.filter((_, idx) => idx !== i)); setSize(null); }} className="ml-auto text-text-muted hover:text-error" aria-label={t("builder.removeConditionAriaLabel")}>
                <Trash2 size={16} aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((p) => [...p, blankRow()])}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary-dark hover:underline"
      >
        <Plus size={15} aria-hidden /> {t("builder.addCondition")}
      </button>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button
          type="button"
          onClick={preview}
          disabled={pending}
          className="min-h-[44px] rounded-button border border-border bg-surface-white px-4 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
        >
          {t("builder.estimateSize")}
        </button>
        {size !== null && (
          <span className="text-sm font-medium text-text-primary">
            {t("builder.sizeResult", { count: size })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("builder.namePlaceholder")} className={inputCls} aria-label={t("builder.nameAriaLabel")} />
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="min-h-[44px] rounded-button bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-card hover:bg-brand-primary-dark disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            {t("builder.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
