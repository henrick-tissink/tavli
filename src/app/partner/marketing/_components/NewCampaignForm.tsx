"use client";

/**
 * §11 v1.5 — one-off campaign create form with a template-library prefill and
 * per-locale (RO/EN/DE) subject + body editors. RO body is required.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { CAMPAIGN_TEMPLATES } from "@/lib/marketing/templates";
import { createOneOffCampaignAction } from "../actions";

type Channel = "email" | "sms" | "whatsapp";
type Locale = "ro" | "en" | "de";
type Copy = Record<Locale, { subject: string; body: string }>;

const EMPTY_COPY: Copy = {
  ro: { subject: "", body: "" },
  en: { subject: "", body: "" },
  de: { subject: "", body: "" },
};

const LOCALE_LABEL: Record<Locale, string> = { ro: "Română", en: "English", de: "Deutsch" };

export function NewCampaignForm({
  organizationId,
  onCreated,
}: {
  organizationId: string;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [copy, setCopy] = useState<Copy>(EMPTY_COPY);
  const [locale, setLocale] = useState<Locale>("ro");

  function applyTemplate(key: string) {
    const t = CAMPAIGN_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setName(t.name);
    setChannel(t.channel);
    setCopy({
      ro: { subject: t.subject.ro, body: t.body.ro },
      en: { subject: t.subject.en, body: t.body.en },
      de: { subject: t.subject.de, body: t.body.de },
    });
  }

  function setField(field: "subject" | "body", value: string) {
    setCopy((prev) => ({ ...prev, [locale]: { ...prev[locale], [field]: value } }));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createOneOffCampaignAction({ organizationId, name, channel, copy });
      if (res.ok) {
        toast.success("Campanie creată (ciornă).");
        onCreated();
        router.refresh();
      } else {
        toast.error(res.code === "invalid_input" ? "Completează numele și mesajul în română." : "Crearea nu a reușit.");
      }
    });
  }

  const inputCls =
    "w-full rounded-button border border-border bg-surface-white px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30";

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-card border border-border bg-surface-white p-5">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Pornește dintr-un șablon
        </label>
        <select
          defaultValue=""
          onChange={(e) => applyTemplate(e.target.value)}
          className={`${inputCls} mt-1.5`}
          aria-label="Șablon"
        >
          <option value="">Fără șablon — pornesc de la zero</option>
          {CAMPAIGN_TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="Numele campaniei"
        className={inputCls}
      />
      <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className={inputCls} aria-label="Canal">
        <option value="email">Email</option>
        <option value="sms">SMS</option>
        <option value="whatsapp">WhatsApp</option>
      </select>

      <div role="tablist" className="inline-flex gap-1 rounded-pill border border-border p-1">
        {(["ro", "en", "de"] as Locale[]).map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={locale === l}
            onClick={() => setLocale(l)}
            className={[
              "min-h-[36px] rounded-pill px-4 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
              locale === l ? "bg-text-primary text-surface-white" : "text-text-secondary hover:text-text-primary",
              l === "ro" ? "" : copy[l].body.trim() ? "" : "opacity-70",
            ].join(" ")}
          >
            {LOCALE_LABEL[l]}
            {l === "ro" && <span className="ml-1 text-brand-primary">•</span>}
          </button>
        ))}
      </div>

      {channel === "email" && (
        <input
          value={copy[locale].subject}
          onChange={(e) => setField("subject", e.target.value)}
          placeholder={`Subiect (${LOCALE_LABEL[locale]})`}
          className={inputCls}
        />
      )}
      <textarea
        value={copy[locale].body}
        onChange={(e) => setField("body", e.target.value)}
        rows={4}
        placeholder={`Mesajul în ${LOCALE_LABEL[locale]}${locale === "ro" ? " (obligatoriu)" : " (opțional)"}`}
        className={`${inputCls} resize-none`}
      />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] items-center rounded-button bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-card hover:bg-brand-primary-dark disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        Salvează ciorna
      </button>
    </form>
  );
}
