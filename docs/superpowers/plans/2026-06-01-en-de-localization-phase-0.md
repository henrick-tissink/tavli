# EN/DE Localization — Phase 0 (i18n Core & Routing Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the trilingual (ro/en/de) i18n foundation — locale core, native-`Intl` formatting, message-catalogue access (server + client), `proxy.ts` detection, the `(public)/[lang]` + `(app)` route-group split, a locale switcher, and SEO hreflang — and prove it end-to-end on the already-translated **pricing** pages (legal folds in Phase 1).

**Architecture:** Static per-locale JSON catalogues with a `Record<Locale, Messages>` build-time completeness contract (the existing locked pattern, generalized), plus native `Intl` (`PluralRules`/`DateTimeFormat`/`NumberFormat`) for plurals/dates/numbers/currency. Two route-group root layouts: `app/(public)/[lang]/` (real `<html lang>`, per-locale static generation) and `app/(app)/` (locale from session/cookie). A `proxy.ts` does as-needed prefixing (RO unprefixed) + detect-once.

**Tech Stack:** Next.js 16.2.4 (App Router; middleware is `proxy.ts`), React, TypeScript, Jest (ts-jest + @testing-library/react), native `Intl`. No i18n dependency.

**Spec:** `docs/superpowers/specs/2026-06-01-en-de-localization-design.md`

**Conventions:**
- Path alias `@/*` → `src/*`.
- Tests live in `__tests__/` dirs beside the code, `describe/it/expect`, run with `npm test`.
- Commit after each task. Per repo policy we work on branch `feat/en-de-localization` (already checked out).
- AGENTS.md: before touching routing, read `node_modules/next/dist/docs/01-app/02-guides/internationalization.md`, `…/03-api-reference/03-file-conventions/proxy.md`, `…/route-groups.md`, `…/04-functions/generate-static-params.md`.

---

## File structure (created/modified in this phase)

**Created**
- `src/lib/i18n/locale.ts` — `Locale` types, `LOCALES`, `DEFAULT_LOCALE`, `isLocale`, BCP-47 map, currency→ISO map, `matchLocale(acceptLanguage)`.
- `src/lib/i18n/format.ts` — `pluralCategory`, `formatDate`, `formatNumber`, `formatCurrency`.
- `src/lib/i18n/t.ts` — `interpolate`, `translate` (string + plural-bag).
- `src/lib/i18n/messages.ts` — `getMessages(locale, ns)`, `Namespace`, namespace catalogue registry.
- `src/lib/i18n/messages-provider.tsx` — `<MessagesProvider>` + `useT(ns)` (client).
- `src/messages/{ro,en,de}/common.json` — first shared namespace (nav/switcher labels).
- `src/lib/i18n/__tests__/locale.test.ts`, `format.test.ts`, `t.test.ts`, `messages.test.ts`, `messages-provider.test.tsx`.
- `src/lib/i18n/routing.ts` — pure proxy helpers: `localeFromPathname`, `decideLocaleAction`.
- `src/lib/i18n/__tests__/routing.test.ts`.
- `proxy.ts` (repo root) — wires the helpers to `NextRequest`/`NextResponse`.
- `src/components/RootScaffold.tsx` — shared `<head>`/font/`<body>` chrome used by both root layouts.
- `src/app/(public)/[lang]/layout.tsx` — public root layout (real `<html lang>`, `generateStaticParams`, `dynamicParams=false`).
- `src/app/(app)/layout.tsx` — app root layout (locale from session/cookie/Accept-Language).
- `src/components/i18n/LocaleSwitcher.tsx` + `src/app/(app)/locale-action.ts` — switcher + `profiles.locale` server action.
- `src/lib/i18n/hreflang.ts` — `buildAlternates(pathname, base)` for `alternates.languages` + canonical.
- `src/lib/i18n/__tests__/hreflang.test.ts`.

**Modified / moved**
- `src/lib/i18n/load-messages.ts` — import `Locale`/`LOCALES`/`DEFAULT_LOCALE`/`isLocale` from `locale.ts` (single source of truth).
- Move pricing routes under `src/app/(public)/[lang]/pricing` (fold today's `app/pricing`, `app/en/pricing`, `app/de/pricing`). Legal stays interim under `(app)/(legal)` until Phase 1.
- Remove `src/app/layout.tsx` (top-level) — replaced by the two group roots.
- `src/app/sitemap.ts` — emit per-locale URLs + hreflang.

> Localizing the **consumer storefront, partner, and admin** UI is **Phase 1–3**, not Phase 0. Phase 0 folds only pricing into `[lang]` to prove the foundation; the rest (incl. legal) moves into `(app)` unchanged and keeps working at its current URLs. See the Task 7 interim-coexistence note.

---

## Task 1: Locale core (`src/lib/i18n/locale.ts`)

**Files:**
- Create: `src/lib/i18n/locale.ts`
- Test: `src/lib/i18n/__tests__/locale.test.ts`
- Modify: `src/lib/i18n/load-messages.ts` (re-source the Locale primitives)

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n/__tests__/locale.test.ts`:

```ts
import {
  isLocale,
  LOCALES,
  DEFAULT_LOCALE,
  BCP47,
  toIsoCurrency,
  matchLocale,
} from "@/lib/i18n/locale";

describe("locale core", () => {
  it("recognizes supported locales and rejects others", () => {
    expect(LOCALES).toEqual(["ro", "en", "de"]);
    expect(DEFAULT_LOCALE).toBe("ro");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("maps each locale to a BCP-47 tag", () => {
    expect(BCP47).toEqual({ ro: "ro-RO", en: "en-GB", de: "de-DE" });
  });

  it("maps currency labels to ISO 4217", () => {
    expect(toIsoCurrency("lei")).toBe("RON");
    expect(toIsoCurrency("EUR")).toBe("EUR");
    expect(toIsoCurrency("TRY")).toBe("TRY");
  });

  it("picks the best Accept-Language match, defaulting to RO", () => {
    expect(matchLocale("de-DE,de;q=0.9,en;q=0.5")).toBe("de");
    expect(matchLocale("en-US,en;q=0.9")).toBe("en");
    expect(matchLocale("fr-FR,fr;q=0.9")).toBe("ro");
    expect(matchLocale(null)).toBe("ro");
    expect(matchLocale("")).toBe("ro");
  });

  it("respects q-value ordering over header order", () => {
    expect(matchLocale("en;q=0.3, de;q=0.9")).toBe("de");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- locale.test`
Expected: FAIL — `Cannot find module '@/lib/i18n/locale'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/i18n/locale.ts`:

```ts
/**
 * Single source of truth for the supported-locale primitives. The pricing
 * catalogue (load-messages.ts) re-uses these so there is exactly one Locale
 * union in the codebase.
 */
export type Locale = "ro" | "en" | "de";

export const LOCALES: readonly Locale[] = ["ro", "en", "de"];
export const DEFAULT_LOCALE: Locale = "ro";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** BCP-47 tags handed to the native Intl APIs. */
export const BCP47: Record<Locale, string> = {
  ro: "ro-RO",
  en: "en-GB",
  de: "de-DE",
};

/** App currency labels → ISO 4217 codes (Intl.NumberFormat requires ISO). */
export function toIsoCurrency(label: string): string {
  switch (label) {
    case "lei":
      return "RON";
    case "EUR":
      return "EUR";
    case "TRY":
      return "TRY";
    default:
      return label.toUpperCase();
  }
}

/** Best match of an Accept-Language header over our locales; RO fallback. */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number.parseFloat(q) : 1 };
    })
    .filter((x) => x.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- locale.test`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Re-source the Locale primitives in `load-messages.ts`**

In `src/lib/i18n/load-messages.ts`, replace the local definitions of `Locale`,
`LOCALES`, `DEFAULT_LOCALE`, `isLocale` with a re-export from `locale.ts`. Change
the top of the file:

```ts
// was: export type Locale = "ro" | "en" | "de"; … (and LOCALES/DEFAULT_LOCALE/isLocale)
export { type Locale, LOCALES, DEFAULT_LOCALE, isLocale } from "./locale";
import { type Locale, DEFAULT_LOCALE, isLocale } from "./locale";
```

Leave the rest of `load-messages.ts` (the `PricingMessages` interface, `CATALOG`,
`loadPricingMessages`) untouched — they continue to consume the imported `Locale`.

- [ ] **Step 6: Run the full i18n + pricing tests to confirm no regression**

Run: `npm test -- i18n`
Expected: PASS — the existing `load-messages` tests still pass with the re-sourced types.

- [ ] **Step 7: Commit**

```bash
git add src/lib/i18n/locale.ts src/lib/i18n/__tests__/locale.test.ts src/lib/i18n/load-messages.ts
git commit -m "feat(i18n): locale core (types, BCP-47, currency-ISO, Accept-Language matcher)"
```

---

## Task 2: Native-`Intl` formatters (`src/lib/i18n/format.ts`)

**Files:**
- Create: `src/lib/i18n/format.ts`
- Test: `src/lib/i18n/__tests__/format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n/__tests__/format.test.ts`:

```ts
import {
  pluralCategory,
  formatDate,
  formatNumber,
  formatCurrency,
} from "@/lib/i18n/format";

describe("native Intl formatting", () => {
  it("returns correct Romanian plural categories (one/few/other)", () => {
    expect(pluralCategory("ro", 1)).toBe("one");
    expect(pluralCategory("ro", 2)).toBe("few");
    expect(pluralCategory("ro", 19)).toBe("few");
    expect(pluralCategory("ro", 20)).toBe("other");
    expect(pluralCategory("ro", 0)).toBe("few");
  });

  it("returns two-form plural categories for en/de", () => {
    expect(pluralCategory("en", 1)).toBe("one");
    expect(pluralCategory("en", 2)).toBe("other");
    expect(pluralCategory("de", 1)).toBe("one");
    expect(pluralCategory("de", 5)).toBe("other");
  });

  it("formats currency from cents in the locale, mapping lei→RON", () => {
    // Non-breaking spaces vary by ICU build; assert the parts we control.
    const ro = formatCurrency(5000, "lei", "ro");
    expect(ro).toMatch(/50/);
    expect(ro.toUpperCase()).toMatch(/RON|LEI/);

    const de = formatCurrency(5000, "EUR", "de");
    expect(de).toMatch(/50/);
    expect(de).toMatch(/€|EUR/);
  });

  it("formats numbers per locale grouping", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    // de uses '.' grouping and ',' decimal
    expect(formatNumber(1234.5, "de")).toBe("1.234,5");
  });

  it("formats a date per locale without throwing", () => {
    const d = new Date(Date.UTC(2026, 8, 15)); // 2026-09-15
    expect(typeof formatDate(d, "ro")).toBe("string");
    expect(formatDate(d, "en")).toMatch(/2026/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- format.test`
Expected: FAIL — `Cannot find module '@/lib/i18n/format'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/i18n/format.ts`:

```ts
import { type Locale, BCP47, toIsoCurrency } from "./locale";

/** CLDR plural category for `n` in `locale` (RO has one/few/other). */
export function pluralCategory(locale: Locale, n: number): Intl.LDMLPluralRule {
  return new Intl.PluralRules(BCP47[locale]).select(n);
}

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

export function formatDate(
  date: Date,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTS,
): string {
  return new Intl.DateTimeFormat(BCP47[locale], opts).format(date);
}

export function formatNumber(
  value: number,
  locale: Locale,
  opts?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(BCP47[locale], opts).format(value);
}

/** Format a cents amount as currency. `currencyLabel` is an app label (lei/EUR/TRY). */
export function formatCurrency(
  cents: number,
  currencyLabel: string,
  locale: Locale,
): string {
  return new Intl.NumberFormat(BCP47[locale], {
    style: "currency",
    currency: toIsoCurrency(currencyLabel),
  }).format(cents / 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- format.test`
Expected: PASS. (If the `de`/`en` number assertions fail due to the Node ICU build, relax them to `.toMatch(/1.234,5/)`-style — but standard Node 18+ full-ICU produces these exact strings.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/format.ts src/lib/i18n/__tests__/format.test.ts
git commit -m "feat(i18n): native Intl formatters (plural, date, number, currency)"
```

---

## Task 3: Translation helper (`src/lib/i18n/t.ts`)

**Files:**
- Create: `src/lib/i18n/t.ts`
- Test: `src/lib/i18n/__tests__/t.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n/__tests__/t.test.ts`:

```ts
import { interpolate, translate } from "@/lib/i18n/t";

describe("interpolate", () => {
  it("substitutes named vars and leaves unknown placeholders intact", () => {
    expect(interpolate("Salut, {name}!", { name: "Ana" })).toBe("Salut, Ana!");
    expect(interpolate("no vars")).toBe("no vars");
    expect(interpolate("{missing}", {})).toBe("{missing}");
  });
});

describe("translate", () => {
  it("interpolates a plain string", () => {
    expect(translate("ro", "Rezervă o {what}", { what: "masă" })).toBe(
      "Rezervă o masă",
    );
  });

  it("selects the Romanian plural form by count", () => {
    const bag = { one: "{count} masă", few: "{count} mese", other: "{count} de mese" };
    expect(translate("ro", bag, { count: 1 })).toBe("1 masă");
    expect(translate("ro", bag, { count: 3 })).toBe("3 mese");
    expect(translate("ro", bag, { count: 20 })).toBe("20 de mese");
  });

  it("uses one/other for english", () => {
    const bag = { one: "{count} table", other: "{count} tables" };
    expect(translate("en", bag, { count: 1 })).toBe("1 table");
    expect(translate("en", bag, { count: 4 })).toBe("4 tables");
  });

  it("falls back to `other` then first form when a category is absent", () => {
    expect(translate("ro", { other: "mese" }, { count: 2 })).toBe("mese");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- t.test`
Expected: FAIL — `Cannot find module '@/lib/i18n/t'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/i18n/t.ts`:

```ts
import { type Locale } from "./locale";
import { pluralCategory } from "./format";

/** A message is either a plain string or a plural-form bag keyed by CLDR category. */
export type MessageValue = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type Vars = Record<string, string | number>;

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

/** Resolve a message value to a final string for `locale`, applying plurals + interpolation. */
export function translate(
  locale: Locale,
  value: MessageValue,
  vars?: Vars,
): string {
  if (typeof value === "string") return interpolate(value, vars);
  const count = typeof vars?.count === "number" ? vars.count : 0;
  const category = pluralCategory(locale, count);
  const chosen =
    value[category] ?? value.other ?? Object.values(value)[0] ?? "";
  return interpolate(chosen, vars);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- t.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/t.ts src/lib/i18n/__tests__/t.test.ts
git commit -m "feat(i18n): t() interpolation + plural resolution"
```

---

## Task 4: Message catalogue registry (`src/lib/i18n/messages.ts`) + `common` namespace

**Files:**
- Create: `src/messages/ro/common.json`, `src/messages/en/common.json`, `src/messages/de/common.json`
- Create: `src/lib/i18n/messages.ts`
- Test: `src/lib/i18n/__tests__/messages.test.ts`

- [ ] **Step 1: Create the three `common.json` catalogues**

`src/messages/ro/common.json`:

```json
{
  "languageName": "Română",
  "switchLanguage": "Schimbă limba",
  "locales": { "ro": "Română", "en": "Engleză", "de": "Germană" },
  "cities": {
    "bucuresti": "București",
    "cluj": "Cluj",
    "timisoara": "Timișoara",
    "brasov": "Brașov",
    "iasi": "Iași",
    "istanbul": "Istanbul"
  }
}
```

`src/messages/en/common.json`:

```json
{
  "languageName": "English",
  "switchLanguage": "Change language",
  "locales": { "ro": "Romanian", "en": "English", "de": "German" },
  "cities": {
    "bucuresti": "Bucharest",
    "cluj": "Cluj",
    "timisoara": "Timișoara",
    "brasov": "Brașov",
    "iasi": "Iași",
    "istanbul": "Istanbul"
  }
}
```

`src/messages/de/common.json`:

```json
{
  "languageName": "Deutsch",
  "switchLanguage": "Sprache ändern",
  "locales": { "ro": "Rumänisch", "en": "Englisch", "de": "Deutsch" },
  "cities": {
    "bucuresti": "Bukarest",
    "cluj": "Cluj",
    "timisoara": "Timișoara",
    "brasov": "Brașov",
    "iasi": "Iași",
    "istanbul": "Istanbul"
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/i18n/__tests__/messages.test.ts`:

```ts
import { getMessages, NAMESPACES } from "@/lib/i18n/messages";

describe("getMessages", () => {
  it("returns the requested namespace in the requested locale", () => {
    expect(getMessages("en", "common").switchLanguage).toBe("Change language");
    expect(getMessages("de", "common").switchLanguage).toBe("Sprache ändern");
    expect(getMessages("ro", "common").cities.bucuresti).toBe("București");
  });

  it("falls back to RO for an unknown locale", () => {
    expect(getMessages("fr", "common").switchLanguage).toBe("Schimbă limba");
  });

  it("has identical key sets across all locales for every namespace", () => {
    const keysOf = (o: unknown): string[] => {
      const acc: string[] = [];
      const walk = (v: unknown, prefix: string) => {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          for (const k of Object.keys(v as Record<string, unknown>)) {
            acc.push(prefix + k);
            walk((v as Record<string, unknown>)[k], prefix + k + ".");
          }
        }
      };
      walk(o, "");
      return acc.sort();
    };
    for (const ns of NAMESPACES) {
      const ro = keysOf(getMessages("ro", ns));
      const en = keysOf(getMessages("en", ns));
      const de = keysOf(getMessages("de", ns));
      expect(en).toEqual(ro);
      expect(de).toEqual(ro);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- messages.test`
Expected: FAIL — `Cannot find module '@/lib/i18n/messages'`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/i18n/messages.ts`:

```ts
import { type Locale, DEFAULT_LOCALE, isLocale } from "./locale";

import roCommon from "@/messages/ro/common.json";
import enCommon from "@/messages/en/common.json";
import deCommon from "@/messages/de/common.json";

/** Structural contract for the `common` namespace. */
export interface CommonMessages {
  languageName: string;
  switchLanguage: string;
  locales: Record<Locale, string>;
  cities: Record<string, string>;
}

/**
 * Registry of namespaces. Each entry is Record<Locale, NsMessages>, so a missing
 * key in any locale is a TypeScript error at build time (the locked completeness
 * contract). Add new namespaces here as later phases extract strings.
 */
const CATALOGS = {
  common: { ro: roCommon, en: enCommon, de: deCommon } as Record<
    Locale,
    CommonMessages
  >,
} as const;

export type Namespace = keyof typeof CATALOGS;
export const NAMESPACES = Object.keys(CATALOGS) as Namespace[];

type NsMessages<N extends Namespace> = (typeof CATALOGS)[N][Locale];

/** Server-side: return the typed namespace object for `locale` (RO fallback). */
export function getMessages<N extends Namespace>(
  locale: string,
  ns: N,
): NsMessages<N> {
  const l: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return CATALOGS[ns][l];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- messages.test`
Expected: PASS. (If jest cannot import JSON, confirm `tsconfig.json` has
`resolveJsonModule: true` — the existing `loadPricingMessages` already imports
JSON, so this is already enabled.)

- [ ] **Step 6: Commit**

```bash
git add src/messages/ro/common.json src/messages/en/common.json src/messages/de/common.json src/lib/i18n/messages.ts src/lib/i18n/__tests__/messages.test.ts
git commit -m "feat(i18n): message registry + common namespace with build-time parity"
```

---

## Task 5: Client provider + `useT` (`src/lib/i18n/messages-provider.tsx`)

**Files:**
- Create: `src/lib/i18n/messages-provider.tsx`
- Test: `src/lib/i18n/__tests__/messages-provider.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n/__tests__/messages-provider.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MessagesProvider, useT } from "@/lib/i18n/messages-provider";

function Probe() {
  const t = useT("common");
  return <span>{t("switchLanguage")}</span>;
}

describe("MessagesProvider + useT", () => {
  it("resolves a key from the provided bundle in the active locale", () => {
    render(
      <MessagesProvider
        locale="de"
        bundle={{ common: { switchLanguage: "Sprache ändern" } }}
      >
        <Probe />
      </MessagesProvider>,
    );
    expect(screen.getByText("Sprache ändern")).toBeInTheDocument();
  });

  it("returns the key itself when missing, and interpolates vars", () => {
    function Probe2() {
      const t = useT("common");
      return (
        <>
          <span data-testid="missing">{t("nope")}</span>
          <span data-testid="interp">{t("hi", { name: "Ana" })}</span>
        </>
      );
    }
    render(
      <MessagesProvider locale="ro" bundle={{ common: { hi: "Salut {name}" } }}>
        <Probe2 />
      </MessagesProvider>,
    );
    expect(screen.getByTestId("missing")).toHaveTextContent("nope");
    expect(screen.getByTestId("interp")).toHaveTextContent("Salut Ana");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- messages-provider`
Expected: FAIL — `Cannot find module '@/lib/i18n/messages-provider'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/i18n/messages-provider.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo } from "react";
import { type Locale } from "./locale";
import { translate, type MessageValue, type Vars } from "./t";

type Bundle = Record<string, Record<string, unknown>>;

const Ctx = createContext<{ locale: Locale; bundle: Bundle } | null>(null);

export function MessagesProvider({
  locale,
  bundle,
  children,
}: {
  locale: Locale;
  bundle: Bundle;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, bundle }), [locale, bundle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(ns: string): (key: string, vars?: Vars) => string {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useT must be used within a MessagesProvider");
  const messages = (ctx.bundle[ns] ?? {}) as Record<string, unknown>;
  return (key: string, vars?: Vars) => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
        messages,
      );
    if (value === undefined) return key;
    return translate(ctx.locale, value as MessageValue, vars);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- messages-provider`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/messages-provider.tsx src/lib/i18n/__tests__/messages-provider.test.tsx
git commit -m "feat(i18n): client MessagesProvider + useT"
```

---

## Task 6: Proxy routing helpers + `proxy.ts`

**Files:**
- Create: `src/lib/i18n/routing.ts`
- Test: `src/lib/i18n/__tests__/routing.test.ts`
- Modify: `src/proxy.ts` (the EXISTING active middleware — see note)

> **CORRECTION (discovered during execution):** This project already has an active
> middleware at **`src/proxy.ts`** (auth/session-refresh: admin/partner gating,
> AAL2/MFA, impersonation, demo noindex). Because the project uses a `src/` dir,
> Next 16 uses `src/proxy.ts` and a root `proxy.ts` is IGNORED. So the locale logic
> is **merged into `src/proxy.ts`** (a path-scoped block for `/pricing`,`/en/*`,`/de/*`
> inserted after the server-action bypass, before the Supabase-env early-out),
> NOT a new root file. The pure decision logic (`routing.ts`) is unit-tested; the
> locale block in `src/proxy.ts` is covered by added cases in
> `src/__tests__/proxy.test.ts` (including a guard that `/bucuresti` is never
> rewritten). The existing broad matcher is reused (no matcher change needed).

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n/__tests__/routing.test.ts`:

```ts
import { localeFromPathname, decideLocaleAction } from "@/lib/i18n/routing";

describe("localeFromPathname", () => {
  it("extracts an explicit locale prefix", () => {
    expect(localeFromPathname("/en/bucuresti")).toEqual({ locale: "en", hasPrefix: true });
    expect(localeFromPathname("/de")).toEqual({ locale: "de", hasPrefix: true });
  });
  it("treats an unprefixed path as RO without a prefix", () => {
    expect(localeFromPathname("/bucuresti/casa-veche")).toEqual({ locale: "ro", hasPrefix: false });
    expect(localeFromPathname("/")).toEqual({ locale: "ro", hasPrefix: false });
  });
});

describe("decideLocaleAction", () => {
  it("rewrites unprefixed paths to the RO internal segment when cookie/RO", () => {
    expect(
      decideLocaleAction({ pathname: "/bucuresti", hasCookie: true, accept: "en" }),
    ).toEqual({ type: "rewrite", to: "/ro/bucuresti", setCookie: undefined });
  });

  it("redirects an unprefixed first-visit to a non-RO detected locale", () => {
    expect(
      decideLocaleAction({ pathname: "/bucuresti", hasCookie: false, accept: "de-DE,de;q=0.9" }),
    ).toEqual({ type: "redirect", to: "/de/bucuresti", setCookie: "de" });
  });

  it("rewrites + sets cookie when first-visit detects RO", () => {
    expect(
      decideLocaleAction({ pathname: "/bucuresti", hasCookie: false, accept: "ro-RO" }),
    ).toEqual({ type: "rewrite", to: "/ro/bucuresti", setCookie: "ro" });
  });

  it("passes through an already-prefixed path untouched", () => {
    expect(
      decideLocaleAction({ pathname: "/en/bucuresti", hasCookie: false, accept: "ro" }),
    ).toEqual({ type: "next", to: undefined, setCookie: undefined });
  });

  it("handles the bare root", () => {
    expect(
      decideLocaleAction({ pathname: "/", hasCookie: true, accept: "en" }),
    ).toEqual({ type: "rewrite", to: "/ro", setCookie: undefined });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- routing.test`
Expected: FAIL — `Cannot find module '@/lib/i18n/routing'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/i18n/routing.ts`:

```ts
import { type Locale, LOCALES, DEFAULT_LOCALE, isLocale, matchLocale } from "./locale";

export interface PathLocale {
  locale: Locale;
  hasPrefix: boolean;
}

/** Read the locale from a pathname's first segment; unprefixed ⇒ RO, no prefix. */
export function localeFromPathname(pathname: string): PathLocale {
  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) return { locale: first, hasPrefix: true };
  return { locale: DEFAULT_LOCALE, hasPrefix: false };
}

export type LocaleAction =
  | { type: "next"; to: undefined; setCookie: Locale | undefined }
  | { type: "rewrite"; to: string; setCookie: Locale | undefined }
  | { type: "redirect"; to: string; setCookie: Locale };

interface DecideInput {
  pathname: string;
  hasCookie: boolean;
  accept: string | null | undefined;
}

/**
 * As-needed-prefix + detect-once. RO is served unprefixed (internal rewrite to
 * /ro/…). A first visit (no cookie) on an unprefixed path detects via
 * Accept-Language: non-RO ⇒ redirect + set cookie; RO ⇒ rewrite + set cookie.
 * An already-prefixed path is served as-is (authoritative URL).
 */
export function decideLocaleAction(input: DecideInput): LocaleAction {
  const { locale, hasPrefix } = localeFromPathname(input.pathname);

  if (hasPrefix) {
    return { type: "next", to: undefined, setCookie: undefined };
  }

  const internal = `/${DEFAULT_LOCALE}${input.pathname === "/" ? "" : input.pathname}`;

  if (input.hasCookie) {
    return { type: "rewrite", to: internal, setCookie: undefined };
  }

  const detected = matchLocale(input.accept);
  if (detected === DEFAULT_LOCALE) {
    return { type: "rewrite", to: internal, setCookie: DEFAULT_LOCALE };
  }
  const prefixed = `/${detected}${input.pathname === "/" ? "" : input.pathname}`;
  return { type: "redirect", to: prefixed, setCookie: detected };
}

export { LOCALES };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- routing.test`
Expected: PASS (6 tests).

- [ ] **Step 5: Write `proxy.ts` (wiring)**

Create `proxy.ts` at the repo root:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { decideLocaleAction } from "@/lib/i18n/routing";

const COOKIE = "NEXT_LOCALE";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(COOKIE);
  const accept = request.headers.get("accept-language");

  const action = decideLocaleAction({ pathname, hasCookie, accept });

  let response: NextResponse;
  if (action.type === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = action.to;
    response = NextResponse.redirect(url);
  } else if (action.type === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = action.to;
    response = NextResponse.rewrite(url);
  } else {
    response = NextResponse.next();
  }

  if (action.setCookie) {
    response.cookies.set(COOKIE, action.setCookie, {
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  // PHASE 0 SCOPE: only the routes that have a `[lang]` counterpart today —
  // pricing and the explicit /en, /de prefixes. The storefront, token flows, and
  // home still live (interim) under (app) at their old unprefixed paths, so the
  // proxy must NOT rewrite them (a rewrite of /bucuresti → /ro/bucuresti would
  // 404 until Phase 1). EXPAND this matcher in Phase 1 as each surface moves
  // under (public)/[lang].
  matcher: ["/pricing", "/en/:path*", "/de/:path*"],
};
```

> Why narrow: `decideLocaleAction` is generic, but the **matcher** decides which
> requests reach it. In Phase 0 only `/pricing` exists under `[lang]`, so matching
> broader paths would rewrite storefront URLs to non-existent localized routes.
> The unit tests still exercise the generic logic with `/bucuresti` examples —
> those just prove the function; the matcher gates real application.

- [ ] **Step 6: Type-check the proxy**

Run: `npx tsc --noEmit`
Expected: no errors in `proxy.ts` / `routing.ts`. (Full project type-check; ignore
unrelated pre-existing errors if any, but there should be none introduced here.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/i18n/routing.ts src/lib/i18n/__tests__/routing.test.ts proxy.ts
git commit -m "feat(i18n): proxy routing helpers + proxy.ts (as-needed prefix, detect-once)"
```

---

## Task 7: Route-group split + fold pricing under `(public)/[lang]` (legal → `(app)` interim)

> **Read first:** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md` and `…/04-functions/generate-static-params.md`.
>
> **Interim coexistence:** Phase 0 introduces the two group root layouts and folds
> ONLY **pricing** into `(public)/[lang]` (pricing already uses the clean
> `<PricingPage locale>` prop, so it proves the foundation with minimal risk).
> **Everything else — including the `(legal)` tree, the storefront (`app/[city]`),
> `app/page.tsx`, the token flows, `partner`, `admin`, `onboard`, `invitations` —
> moves into the `(app)` group unchanged** (pure folder move, route groups are
> path-invisible, so URLs and behavior are identical). This is required because
> deleting the top-level `app/layout.tsx` means every page-rendering route must
> sit under one of the two group roots. Legal pages keep their current per-locale
> `/en/*`,`/de/*` routes and `display:contents` wrappers under `(app)` for now;
> **legal is properly folded into `(public)/[lang]` in Phase 1**, alongside the
> storefront. (This is a small refinement of spec §9, which grouped legal into
> Phase 0; folding it now would mean consolidating six page-trios for no extra
> foundation-proving value.)

**Files:**
- Create: `src/components/RootScaffold.tsx`
- Create: `src/app/(public)/[lang]/layout.tsx`
- Create: `src/app/(app)/layout.tsx`
- Delete: `src/app/layout.tsx`
- Move: pricing routes into `src/app/(public)/[lang]/pricing` (drop the `/en`,`/de` literal dupes)
- Move (interim, no URL change): `app/page.tsx`, `app/[city]`, `app/(legal)`, `app/partner`, `app/admin`, `app/onboard`, `app/reservations`, `app/reviews`, `app/event-requests`, `app/invitations` into `src/app/(app)/`

- [ ] **Step 1: Extract the shared root scaffold**

Create `src/components/RootScaffold.tsx` (the body chrome shared by both roots,
lifted from the current `app/layout.tsx`):

```tsx
import { Inter, Fraunces } from "next/font/google";
import { Toaster } from "@/components/toast";
import { CookieFootnote } from "@/components/legal/cookie-footnote";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});
const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces",
});

/** Shared <html>/<body> chrome. `lang` differs per root layout. */
export function RootScaffold({
  lang,
  children,
}: {
  lang: string;
  children: React.ReactNode;
}) {
  return (
    <html lang={lang} className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans">
        {children}
        <SiteFooter />
        <Toaster />
        <CookieFootnote />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create the `(public)/[lang]` root layout**

Create `src/app/(public)/[lang]/layout.tsx`:

```tsx
import { notFound } from "next/navigation";
import { LOCALES, isLocale } from "@/lib/i18n/locale";
import { RootScaffold } from "@/components/RootScaffold";
import "@/app/globals.css";

export const dynamicParams = false; // only ro/en/de; anything else 404s

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function PublicRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <RootScaffold lang={lang}>{children}</RootScaffold>;
}
```

> Note: `globals.css` import path becomes `@/app/globals.css` from the new
> location (the file stays at `src/app/globals.css`).

- [ ] **Step 3: Create the `(app)` root layout**

Create `src/app/(app)/layout.tsx`:

```tsx
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, matchLocale, type Locale } from "@/lib/i18n/locale";
import { RootScaffold } from "@/components/RootScaffold";
import { getSessionLocale } from "@/lib/i18n/session-locale";
import "@/app/globals.css";

export default async function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await resolveAppLocale();
  return <RootScaffold lang={locale}>{children}</RootScaffold>;
}

async function resolveAppLocale(): Promise<Locale> {
  const sessionLocale = await getSessionLocale();
  if (sessionLocale) return sessionLocale;
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  if (cookieLocale && isLocale(cookieLocale)) return cookieLocale;
  return matchLocale((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}
```

- [ ] **Step 4: Add the session-locale helper**

Create `src/lib/i18n/session-locale.ts`:

```ts
import "server-only";
import { type Locale, isLocale } from "./locale";
import { getCurrentSession } from "@/lib/auth/session";

/**
 * The signed-in user's profile locale, or null if not signed in / not a supported
 * value. `getCurrentSession` returns null gracefully when unauthenticated or when
 * Supabase env is absent, so pre-auth (app) pages (sign-in, onboarding) fall
 * through to cookie/Accept-Language.
 */
export async function getSessionLocale(): Promise<Locale | null> {
  const session = await getCurrentSession();
  const locale = session?.profile.locale;
  return locale && isLocale(locale) ? locale : null;
}
```

> `getCurrentSession(): Promise<CurrentSession | null>` is the real accessor in
> `src/lib/auth/session.ts`; `CurrentSession.profile.locale: string`. Confirmed.

- [ ] **Step 5: Move pricing into `(public)/[lang]`, delete the old top-level layout, move everything else into `(app)`**

```bash
cd /Users/henricktissink/Sauce/tavli/src/app

# pricing → (public)/[lang]/pricing  (single canonical route; drop the en/de dupes)
mkdir -p "(public)/[lang]"
git mv pricing "(public)/[lang]/pricing"
git rm -r en de              # remove the old literal /en/pricing and /de/pricing folders

# everything else (interim) → (app)/…  (no URL change; route group is path-invisible)
mkdir -p "(app)"
git mv page.tsx "(app)/page.tsx"
for d in "[city]" "(legal)" partner admin onboard reservations reviews event-requests invitations; do
  [ -e "$d" ] && git mv "$d" "(app)/$d"
done

# remove the now-replaced top-level root layout
git rm layout.tsx
```

> After the move, update any **relative** imports that broke. Most code uses the
> `@/` alias (unaffected). `globals.css` stays at `src/app/globals.css` and is
> imported by the two new root layouts via `@/app/globals.css`. The route handlers
> `api/`, `auth/`, `c/`, `u/` remain at the top level (no layout needed).

- [ ] **Step 6: Make the pricing pages locale-driven**

`(public)/[lang]/pricing/page.tsx` currently hardcodes `locale="ro"`. Replace its
body so the locale comes from the segment param:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PricingPage } from "@/components/pricing/PricingPage";
import { loadPricingMessages } from "@/lib/i18n/load-messages";
import { isLocale } from "@/lib/i18n/locale";
import { buildPricingMetadata } from "@/lib/pricing/seo";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return buildPricingMetadata(isLocale(lang) ? lang : "ro", loadPricingMessages(lang));
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <PricingPage locale={lang} />;
}
```

(Legal pages are NOT touched in Phase 0 — they keep their existing per-locale
routes under `(app)/(legal)` and render as before. They get folded into
`(public)/[lang]` in Phase 1.)

- [ ] **Step 7: Verify the build and routes**

Run: `npm run build`
Expected: build succeeds; `app/(public)/[lang]/pricing` is generated for ro/en/de;
no "two routes resolve to the same path" error; no missing-root-layout error.

Then run dev and smoke the routes:

Run: `npm run dev` and check:
- `/pricing` → rewritten to RO pricing (200).
- `/en/pricing`, `/de/pricing` → localized pricing (200).
- A partner route (e.g. `/partner/sign-in`) still 200s (now under `(app)`).
- `/fr/pricing` → 404 (dynamicParams=false).

Expected: all as described. If `/pricing` (bare) fails to resolve, apply the
**fallback** from spec §3.2 (switch `decideLocaleAction` + layouts to
`localePrefix: always` and add a `/ → /ro` redirect) — document the switch in the
commit message.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(i18n): route-group split ((public)/[lang] + (app)); fold pricing under [lang]"
```

---

## Task 8: Locale switcher + `profiles.locale` action + login cookie sync

**Files:**
- Create: `src/components/i18n/LocaleSwitcher.tsx`
- Create: `src/app/(app)/locale-action.ts`
- Test: `src/components/i18n/__tests__/LocaleSwitcher.test.tsx`
- Modify: the sign-in success path to set `NEXT_LOCALE` from `profiles.locale`

- [ ] **Step 1: Write the failing test (consumer switcher renders locale options)**

Create `src/components/i18n/__tests__/LocaleSwitcher.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";

describe("LocaleSwitcher (consumer)", () => {
  it("renders the three locale options with the active one marked", () => {
    render(<LocaleSwitcher mode="path" current="en" pathname="/en/bucuresti" />);
    expect(screen.getByRole("link", { name: /Română/i })).toHaveAttribute("href", "/bucuresti");
    expect(screen.getByRole("link", { name: /Deutsch/i })).toHaveAttribute("href", "/de/bucuresti");
    expect(screen.getByRole("link", { name: /English/i })).toHaveAttribute("aria-current", "true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- LocaleSwitcher`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the path helper + switcher**

Add to `src/lib/i18n/routing.ts` (append):

```ts
/** Swap the locale prefix on a pathname for the consumer switcher. RO ⇒ no prefix. */
export function withLocale(pathname: string, target: Locale): string {
  const { hasPrefix } = localeFromPathname(pathname);
  const rest = hasPrefix
    ? "/" + pathname.split("/").slice(2).join("/")
    : pathname;
  const clean = rest === "/" ? "" : rest;
  return target === DEFAULT_LOCALE ? clean || "/" : `/${target}${clean}`;
}
```

Add a focused test to `routing.test.ts`:

```ts
import { withLocale } from "@/lib/i18n/routing";
describe("withLocale", () => {
  it("adds/strips the prefix correctly", () => {
    expect(withLocale("/en/bucuresti", "ro")).toBe("/bucuresti");
    expect(withLocale("/bucuresti", "de")).toBe("/de/bucuresti");
    expect(withLocale("/en", "ro")).toBe("/");
    expect(withLocale("/", "en")).toBe("/en");
  });
});
```

Create `src/components/i18n/LocaleSwitcher.tsx`:

```tsx
"use client";

import Link from "next/link";
import { LOCALES, type Locale } from "@/lib/i18n/locale";
import { withLocale } from "@/lib/i18n/routing";
import { setAppLocale } from "@/app/(app)/locale-action";

const LABEL: Record<Locale, string> = { ro: "Română", en: "English", de: "Deutsch" };

type Props =
  | { mode: "path"; current: Locale; pathname: string }
  | { mode: "preference"; current: Locale };

export function LocaleSwitcher(props: Props) {
  if (props.mode === "path") {
    return (
      <nav aria-label="Language">
        {LOCALES.map((l) => (
          <Link
            key={l}
            href={withLocale(props.pathname, l)}
            aria-current={l === props.current ? "true" : undefined}
          >
            {LABEL[l]}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Language">
      {LOCALES.map((l) => (
        <form key={l} action={setAppLocale.bind(null, l)}>
          <button type="submit" aria-current={l === props.current ? "true" : undefined}>
            {LABEL[l]}
          </button>
        </form>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Add the `(app)` locale server action**

Create `src/app/(app)/locale-action.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { type Locale } from "@/lib/i18n/locale";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { profiles } from "@/lib/db/schema";

/** Set the app locale: cookie always; profiles.locale when signed in. */
export async function setAppLocale(locale: Locale) {
  (await cookies()).set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  const session = await getCurrentSession();
  if (session) {
    await dbAdmin.update(profiles).set({ locale }).where(eq(profiles.id, session.userId));
  }
  revalidatePath("/", "layout");
}
```

> Confirmed names: `getCurrentSession` (→ `session.userId`), `dbAdmin` from
> `@/lib/db/admin`, `profiles` from `@/lib/db/schema` (`profiles.id`,
> `profiles.locale`).

- [ ] **Step 5: Login cookie sync**

In the partner/admin sign-in success path (`src/app/(app)/partner/sign-in/actions.ts`
and the admin equivalent), after a successful authentication where the profile is
known, set the cookie from the profile locale:

```ts
import { cookies } from "next/headers";
// …after successful sign-in and loading the user's profile:
(await cookies()).set("NEXT_LOCALE", profile.locale ?? "ro", {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
});
```

> Locate the exact post-auth point where `profile` is available; if the action
> only has the user id, fetch `profiles.locale` once. Keep this additive — do not
> change existing redirect behavior.

- [ ] **Step 6: Run tests**

Run: `npm test -- LocaleSwitcher routing.test`
Expected: PASS (switcher render + `withLocale` cases).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(i18n): LocaleSwitcher + profiles.locale action + login cookie sync"
```

---

## Task 9: hreflang / canonical + per-locale sitemap

**Files:**
- Create: `src/lib/i18n/hreflang.ts`
- Test: `src/lib/i18n/__tests__/hreflang.test.ts`
- Modify: `src/app/(public)/[lang]/pricing/page.tsx` `generateMetadata` to add alternates
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n/__tests__/hreflang.test.ts`:

```ts
import { buildAlternates } from "@/lib/i18n/hreflang";

describe("buildAlternates", () => {
  it("emits canonical + ro/en/de + x-default for a localized path", () => {
    const alt = buildAlternates("/pricing", "en", "https://tavli.ro");
    expect(alt.canonical).toBe("https://tavli.ro/en/pricing");
    expect(alt.languages).toEqual({
      ro: "https://tavli.ro/pricing",
      en: "https://tavli.ro/en/pricing",
      de: "https://tavli.ro/de/pricing",
      "x-default": "https://tavli.ro/pricing",
    });
  });

  it("treats the RO canonical as unprefixed", () => {
    const alt = buildAlternates("/pricing", "ro", "https://tavli.ro");
    expect(alt.canonical).toBe("https://tavli.ro/pricing");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hreflang.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/i18n/hreflang.ts`:

```ts
import { LOCALES, DEFAULT_LOCALE, type Locale } from "./locale";
import { withLocale } from "./routing";

export interface Alternates {
  canonical: string;
  languages: Record<string, string>;
}

/**
 * Build canonical + hreflang alternates for a public path. `unprefixedPath` is
 * the route WITHOUT any locale prefix (e.g. "/pricing"). RO is unprefixed;
 * x-default points at RO.
 */
export function buildAlternates(
  unprefixedPath: string,
  current: Locale,
  base: string,
): Alternates {
  const url = (l: Locale) => base + withLocale(unprefixedPath, l);
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = url(l);
  languages["x-default"] = url(DEFAULT_LOCALE);
  return { canonical: url(current), languages };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- hreflang.test`
Expected: PASS.

- [ ] **Step 5: Wire alternates into pricing metadata**

In `src/app/(public)/[lang]/pricing/page.tsx`, extend `generateMetadata` to merge
alternates (using the existing `getSiteUrl`):

```ts
import { getSiteUrl } from "@/lib/site-url";
import { buildAlternates } from "@/lib/i18n/hreflang";
// …inside generateMetadata, after computing `lang`:
const base = getSiteUrl();
const meta = buildPricingMetadata(isLocale(lang) ? lang : "ro", loadPricingMessages(lang));
return {
  ...meta,
  alternates: buildAlternates("/pricing", isLocale(lang) ? lang : "ro", base),
};
```

- [ ] **Step 6: Per-locale sitemap — PRICING ONLY in Phase 0**

Only routes that exist in all three locales may be emitted per-locale. In Phase 0
that is **pricing** (the storefront, home, and city pages are still RO-only under
`(app)`, so they MUST stay single-RO entries until Phase 1, or the sitemap would
advertise `/en/bucuresti` URLs that 404).

Add a localized entry for `/pricing` and leave the existing home/restaurant/city
entries exactly as they are. In `src/app/sitemap.ts`:

```ts
import { LOCALES } from "@/lib/i18n/locale";
import { buildAlternates } from "@/lib/i18n/hreflang";

// inside sitemap(), build pricing's per-locale entries:
const pricingEntries: MetadataRoute.Sitemap = LOCALES.map((l) => {
  const alt = buildAlternates("/pricing", l, base);
  return {
    url: alt.canonical,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.8,
    alternates: { languages: alt.languages },
  };
});

// return [...existing home/restaurant/city entries (unchanged), ...pricingEntries];
```

> Phase 1 expands this: once the storefront lives under `[lang]`, replace the
> RO-only restaurant/city entries with `localizedEntries(...)` over all locales.

- [ ] **Step 7: Run tests + build**

Run: `npm test -- hreflang.test` then `npm run build`
Expected: tests PASS; build succeeds; sitemap renders without error.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(i18n): hreflang/canonical alternates + per-locale sitemap"
```

---

## Task 10: Phase 0 end-to-end acceptance

**Files:** none new — verification only.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all i18n unit tests pass; no pre-existing tests broken.

- [ ] **Step 2: Production build + static-generation check**

Run: `npm run build`
Expected: build succeeds. In the build output, confirm `(public)/[lang]/pricing`
and the legal pages are listed as statically generated (SSG/ISR) for ro/en/de
(static generation preserved — spec acceptance).

- [ ] **Step 3: Manual smoke (dev)**

Run: `npm run dev`, then verify each:
- [ ] First visit with `Accept-Language: de` to `/pricing` → redirects to `/de/pricing`, sets `NEXT_LOCALE=de`.
- [ ] Reload `/pricing` (cookie now present) → served as RO (cookie was set to `de`? no — cookie is `de`, so `/pricing` reload with a `de` cookie still rewrites to `/ro/pricing` because the URL is unprefixed and the cookie only suppresses *redirects*). Expected: `/pricing` shows RO content; to see DE the user is on `/de/pricing`. Confirm no redirect loop.
- [ ] `/en/pricing` and `/de/pricing` render fully localized; switching via `<LocaleSwitcher>` changes URL and content.
- [ ] `/pricing` (RO) renders unprefixed; URL stays `/pricing`.
- [ ] `/fr/pricing` → 404 (`dynamicParams=false`).
- [ ] `/` (home) still renders the existing RO landing under `(app)` — proxy does NOT touch it (not in matcher).
- [ ] The storefront (`/bucuresti`), legal pages, and a partner route (`/partner/sign-in`) all still work under `(app)`; the `(app)` root sets `<html lang>` from cookie/Accept-Language (RO by default).
- [ ] View source on `/en/pricing`: `<html lang="en">`, `<link rel="canonical" href=".../en/pricing">`, and `<link rel="alternate" hreflang="ro|en|de|x-default" …>` present.
- [ ] `/sitemap.xml` includes the three per-locale pricing URLs with alternates; storefront URLs remain RO-only.

> **Note on the bare-`/` validation gate (spec §3.2):** it does NOT apply in Phase 0
> because the home route stays under `(app)` (unprefixed, untouched by the proxy).
> The gate becomes relevant in **Phase 1**, when the home/storefront move under
> `[lang]` and the proxy matcher expands to cover `/` — at which point the
> `localePrefix: always` fallback is the documented contingency.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: passes (or only pre-existing unrelated warnings).

- [ ] **Step 5: Final Phase-0 commit (if any fixes were needed)**

```bash
git add -A
git commit -m "test(i18n): Phase 0 acceptance — pricing trilingual under new routing"
```

---

## Phase 0 Definition of Done

- [ ] i18n core (`locale`, `format`, `t`, `messages`, provider) implemented + unit-tested.
- [ ] `proxy.ts` does as-needed prefix + detect-once; helpers unit-tested.
- [ ] Route-group split live: `(public)/[lang]` (real `<html lang>`, SSG per locale) and `(app)` (locale from session/cookie/Accept-Language).
- [ ] Pricing fully works in ro/en/de under the new routing, with switching, detection, hreflang/canonical, and static generation intact. (Legal + storefront localization is Phase 1.)
- [ ] `<LocaleSwitcher>` + `profiles.locale` action + login cookie sync.
- [ ] Per-locale sitemap.
- [ ] `npm test`, `npm run build`, `npm run lint` all green.

> **Not in Phase 0** (later phases): folding the legal tree into `(public)/[lang]`
> and moving the storefront under `[lang]` (Phase 1, which also expands the proxy
> matcher to `/` + storefront paths and triggers the bare-`/` validation gate);
> extracting storefront/partner/admin UI strings; wiring restaurant/menu content
> translations; the `locale` migration on `reservations`/`event_requests`; email
> localization; the `no-literal-string` regression-guard lint rule (added once the
> first surface is extracted, Phase 1).
