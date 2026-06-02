"use client";

/**
 * §11 v1.5 — one-off campaign create form with a template-library prefill and
 * per-locale (RO/EN/DE) subject + body editors. RO body is required.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useT } from "@/lib/i18n/messages-provider";
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

export function NewCampaignForm({
  organizationId,
  onCreated,
}: {
  organizationId: string;
  onCreated: () => void;
}) {
  const t = useT("partner.marketing");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [copy, setCopy] = useState<Copy>(EMPTY_COPY);
  const [locale, setLocale] = useState<Locale>("ro");

  const localeName = (l: Locale) => t(`newCampaign.localeNames.${l}`);

  function applyTemplate(key: string) {
    const tpl = CAMPAIGN_TEMPLATES.find((x) => x.key === key);
    if (!tpl) return;
    setName(tpl.name);
    setChannel(tpl.channel);
    setCopy({
      ro: { subject: tpl.subject.ro, body: tpl.body.ro },
      en: { subject: tpl.subject.en, body: tpl.body.en },
      de: { subject: tpl.subject.de, body: tpl.body.de },
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
        toast.success(t("newCampaign.created"));
        onCreated();
        router.refresh();
      } else {
        toast.error(res.code === "invalid_input" ? t("newCampaign.errorInvalidInput") : t("newCampaign.errorGeneric"));
      }
    });
  }

  const inputCls =
    "w-full rounded-button border border-border bg-surface-white px-4 py-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30";

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-card border border-border bg-surface-white p-5">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          {t("newCampaign.templateLabel")}
        </label>
        <select
          defaultValue=""
          onChange={(e) => applyTemplate(e.target.value)}
          className={`${inputCls} mt-1.5`}
          aria-label={t("newCampaign.templateAriaLabel")}
        >
          <option value="">{t("newCampaign.templateNone")}</option>
          {CAMPAIGN_TEMPLATES.map((tpl) => (
            <option key={tpl.key} value={tpl.key}>
              {tpl.name}
            </option>
          ))}
        </select>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder={t("newCampaign.namePlaceholder")}
        className={inputCls}
      />
      <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className={inputCls} aria-label={t("newCampaign.channelAriaLabel")}>
        <option value="email">{t("channels.email")}</option>
        <option value="sms">{t("channels.sms")}</option>
        <option value="whatsapp">{t("channels.whatsapp")}</option>
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
            {localeName(l)}
            {l === "ro" && <span className="ml-1 text-brand-primary">•</span>}
          </button>
        ))}
      </div>

      {channel === "email" && (
        <input
          value={copy[locale].subject}
          onChange={(e) => setField("subject", e.target.value)}
          placeholder={t("newCampaign.subjectPlaceholder", { locale: localeName(locale) })}
          className={inputCls}
        />
      )}
      <textarea
        value={copy[locale].body}
        onChange={(e) => setField("body", e.target.value)}
        rows={4}
        placeholder={
          locale === "ro"
            ? t("newCampaign.bodyPlaceholderRequired", { locale: localeName(locale) })
            : t("newCampaign.bodyPlaceholderOptional", { locale: localeName(locale) })
        }
        className={`${inputCls} resize-none`}
      />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] items-center rounded-button bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-card hover:bg-brand-primary-dark disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        {t("newCampaign.submit")}
      </button>
    </form>
  );
}
