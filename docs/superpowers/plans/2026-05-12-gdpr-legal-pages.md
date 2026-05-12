# GDPR + Legal Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four Romanian-law-aligned legal documents (Privacy Policy, Terms of Service, Cookie Policy, ANPC + SOL notice) in RO + EN, a minimal cookie disclosure footnote, a new desktop footer, a mobile profile "Legal" section, and an ANPC strip on the reservation flow — so Tavli has a compliant surface before partner outreach.

**Architecture:** Eight new routes under an `(legal)` Next.js route group, content as `.mdx` files behind a single `ENTITY` placeholder registry. Three new components (`<Placeholder>`, `<CookieFootnote>`, `<SiteFooter>`) mounted globally. MDX is a new dependency added once and amortized against future blog/help-center work.

**Tech Stack:** Next.js 16 App Router (server components default for the legal pages), React 19, Tailwind 4, `@next/mdx@^16` + `@mdx-js/loader@^3` + `@mdx-js/react@^3` (new deps), Jest + React Testing Library.

**Reference spec:** `docs/superpowers/specs/2026-05-12-gdpr-legal-pages-design.md`

---

## File Map

**New files:**
- `src/content/legal/entity.ts` — placeholder registry
- `src/content/legal/ro/privacy.mdx` — RO Privacy Policy
- `src/content/legal/ro/terms.mdx` — RO Terms of Service
- `src/content/legal/ro/cookies.mdx` — RO Cookie Policy
- `src/content/legal/ro/anpc.mdx` — RO ANPC + SOL Notice
- `src/content/legal/en/privacy.mdx` — EN Privacy Policy
- `src/content/legal/en/terms.mdx` — EN Terms of Service
- `src/content/legal/en/cookies.mdx` — EN Cookie Policy
- `src/content/legal/en/anpc.mdx` — EN ANPC + SOL Notice
- `src/content/legal/__tests__/parity.test.ts` — heading-structure parity between RO/EN pairs
- `src/components/legal/placeholder.tsx` — placeholder renderer
- `src/components/legal/__tests__/placeholder.test.tsx`
- `src/components/legal/cookie-footnote.tsx` — bottom-anchored disclosure
- `src/components/__tests__/cookie-footnote.test.tsx`
- `src/components/site-footer.tsx` — desktop footer with legal + ANPC links
- `src/components/__tests__/site-footer.test.tsx`
- `src/types/mdx.d.ts` — TS module declaration for `.mdx` imports
- `src/app/(legal)/layout.tsx` — shared `<LegalLayout>` wrapper
- `src/app/(legal)/confidentialitate/page.tsx`
- `src/app/(legal)/termeni/page.tsx`
- `src/app/(legal)/cookie-uri/page.tsx`
- `src/app/(legal)/anpc/page.tsx`
- `src/app/(legal)/en/privacy/page.tsx`
- `src/app/(legal)/en/terms/page.tsx`
- `src/app/(legal)/en/cookies/page.tsx`
- `src/app/(legal)/en/anpc/page.tsx`

**Modified:**
- `package.json`, `package-lock.json` — `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`
- `next.config.ts` — `withMDX` wrapper
- `src/app/layout.tsx` — mount `<CookieFootnote />` + `<SiteFooter />`
- `src/app/[city]/(shell)/profile/page.tsx` — add "Legal & informare" section
- `src/components/reservation-sheet.tsx` — add ANPC strip + terms-acceptance line at the bottom of the confirmation step

---

## Task 1: Add MDX + Typography dependencies and configure `next.config.ts`

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `next.config.ts`
- Modify: `src/app/globals.css`
- Create: `src/types/mdx.d.ts`

- [ ] **Step 1: Install the dependencies**

Run from `/Users/henricktissink/Sauce/masaro`:
```bash
npm install @next/mdx@^16 @mdx-js/loader@^3 @mdx-js/react@^3
npm install --save-dev @types/mdx@^2 @tailwindcss/typography@^0.5
```

Expected: `npm` adds the five packages and updates `package-lock.json`. No errors.

**Step 1b: Wire typography into Tailwind v4 via the CSS plugin directive**

In `src/app/globals.css`, change the first line from:

```css
@import "tailwindcss";
```

to:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

(Tailwind v4 loads plugins via `@plugin` in CSS, not via the JS config.)

- [ ] **Step 2: Wrap `next.config.ts` with `withMDX`**

Replace the entire file with:

```ts
import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const supabaseHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "*.supabase.co";
  try {
    return new URL(url).hostname;
  } catch {
    return "*.supabase.co";
  }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: supabaseHost },
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
    ],
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
```

- [ ] **Step 3: Add an MDX type declaration**

Create `src/types/mdx.d.ts`:

```ts
declare module "*.mdx" {
  import type { ComponentProps, FunctionComponent } from "react";
  const MDXComponent: FunctionComponent<ComponentProps<"div">>;
  export default MDXComponent;
}
```

- [ ] **Step 4: Verify the build still works**

Run:
```bash
npm run build
```

Expected: build completes without errors. (You'll see the new `pageExtensions` field in the Next.js startup banner.)

- [ ] **Step 5: Verify existing tests still pass**

Run:
```bash
npm test -- --listTests | wc -l
npm test
```

Expected: existing test count unchanged, all green.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json next.config.ts src/types/mdx.d.ts
git commit -m "chore: add @next/mdx for legal page content"
```

---

## Task 2: Entity placeholder registry

**Files:**
- Create: `src/content/legal/entity.ts`

- [ ] **Step 1: Create the file**

Create `src/content/legal/entity.ts`:

```ts
/**
 * Single source of truth for legal-document placeholders.
 *
 * Replace the [TBD] values once the legal entity is registered.
 * Touch only this file — every legal document picks up the change automatically.
 */
export const ENTITY = {
  name: "[ENTITY NAME — TBD]",
  cui: "[CUI — TBD]",
  jNumber: "[J-NUMBER — TBD]",
  address: "[REGISTERED ADDRESS — TBD]",
  email: "privacy@tavli.ro",
  contactEmail: "hello@tavli.ro",
  appUrl: "https://tavli.ro",
  jurisdiction: "România",
} as const;

export type EntityKey = keyof typeof ENTITY;
```

- [ ] **Step 2: Commit**

```bash
git add src/content/legal/entity.ts
git commit -m "feat(legal): entity placeholder registry"
```

---

## Task 3: `<Placeholder>` component (TDD)

**Files:**
- Create: `src/components/legal/placeholder.tsx`
- Create: `src/components/legal/__tests__/placeholder.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/legal/__tests__/placeholder.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { Placeholder } from "../placeholder";

describe("<Placeholder>", () => {
  it("renders the value plainly when NODE_ENV is production", () => {
    const original = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    });

    render(<Placeholder name="name" />);
    const el = screen.getByText(/ENTITY NAME — TBD/);
    expect(el).toBeInTheDocument();
    expect(el).not.toHaveClass("border-dashed");

    Object.defineProperty(process.env, "NODE_ENV", {
      value: original,
      configurable: true,
    });
  });

  it("renders the value in a dashed-orange box in development", () => {
    const original = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    });

    const { container } = render(<Placeholder name="name" />);
    const box = container.querySelector(".border-dashed");
    expect(box).not.toBeNull();
    expect(box).toHaveTextContent(/ENTITY NAME — TBD/);
    expect(box).toHaveTextContent("PLACEHOLDER");

    Object.defineProperty(process.env, "NODE_ENV", {
      value: original,
      configurable: true,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx jest src/components/legal/__tests__/placeholder.test.tsx
```

Expected: FAIL — "Cannot find module '../placeholder'".

- [ ] **Step 3: Implement the component**

Create `src/components/legal/placeholder.tsx`:

```tsx
import { ENTITY, type EntityKey } from "@/content/legal/entity";

interface PlaceholderProps {
  name: EntityKey;
}

export function Placeholder({ name }: PlaceholderProps) {
  const value = ENTITY[name];

  if (process.env.NODE_ENV === "production") {
    return <span>{value}</span>;
  }

  return (
    <span
      className="border-dashed border-2 border-brand-primary rounded-[4px] px-1.5 py-0.5 bg-brand-primary-soft text-text-primary font-mono text-[0.95em] inline-flex items-center gap-1 align-baseline"
      title="Replace ENTITY value in src/content/legal/entity.ts"
    >
      <span className="text-[0.7em] uppercase tracking-wider text-brand-primary-dark font-bold">
        Placeholder
      </span>
      <span>{value}</span>
    </span>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx jest src/components/legal/__tests__/placeholder.test.tsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/legal/placeholder.tsx src/components/legal/__tests__/placeholder.test.tsx
git commit -m "feat(legal): Placeholder component (dev-orange / prod-plain)"
```

---

## Task 4: `(legal)` route-group layout

**Files:**
- Create: `src/app/(legal)/layout.tsx`

- [ ] **Step 1: Create the layout**

Create `src/app/(legal)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import Link from "next/link";

export default function LegalLayout({ children }: { children: ReactNode }) {
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="min-h-screen bg-surface-bg">
      {isDev && (
        <div className="sticky top-0 z-50 bg-brand-primary text-white text-center text-xs font-bold py-1.5 px-4">
          ⚠ REVIEW BEFORE LAUNCH — these documents are templates, not legal advice. Have a Romanian lawyer review before any marketing push.
        </div>
      )}
      <article className="max-w-3xl mx-auto px-6 py-12 prose prose-neutral prose-headings:font-display prose-headings:font-bold prose-h1:text-4xl prose-h1:tracking-tight prose-h1:mb-2 prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-3 prose-p:leading-relaxed prose-p:text-text-primary prose-a:text-brand-primary prose-a:no-underline hover:prose-a:underline">
        {children}
        <hr className="my-12 border-border" />
        <p className="text-sm text-text-muted">
          <Link href="/">← Înapoi la Tavli</Link>
        </p>
      </article>
    </div>
  );
}
```

- [ ] **Step 2: Verify the layout type-checks**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors. (Typography styles come from the `@tailwindcss/typography` plugin installed in Task 1.)

- [ ] **Step 3: Commit**

```bash
git add src/app/(legal)/layout.tsx
git commit -m "feat(legal): (legal) route-group layout with dev review banner"
```

---

## Task 5: RO Privacy Policy MDX content

**Files:**
- Create: `src/content/legal/ro/privacy.mdx`

- [ ] **Step 1: Create the file with full prose**

Create `src/content/legal/ro/privacy.mdx`:

````mdx
import { Placeholder } from "@/components/legal/placeholder";

# Politica de confidențialitate

*Ultima actualizare: 12 mai 2026*

## 1. Operatorul de date

Operatorul de date cu caracter personal pentru platforma Tavli (denumită în continuare „Tavli", „noi", „nostru") este <Placeholder name="name" />, cu sediul în <Placeholder name="address" />, înregistrată la Registrul Comerțului cu numărul <Placeholder name="jNumber" />, având CUI <Placeholder name="cui" />.

Pentru orice întrebare privind prelucrarea datelor tale, poți să ne contactezi la <Placeholder name="email" />.

## 2. Ce date colectăm

Colectăm doar datele necesare pentru a-ți oferi serviciul:

- **Date de identificare**: numele și prenumele (sau pseudonim), adresă de e-mail, număr de telefon — colectate când faci o rezervare sau îți creezi un cont.
- **Date despre rezervări**: restaurantul, data, ora, numărul de persoane, eventuale preferințe alimentare sau note adresate restaurantului.
- **Date despre cont** (opțional): preferințele tale (restaurante salvate, orașul implicit, preferința de notificări) — stocate în browserul tău (localStorage) și/sau în contul tău Tavli.
- **Date tehnice**: adresa IP, tipul de browser, sistemul de operare, paginile vizitate — colectate prin jurnale de server pentru securitate și depanare.
- **Recenzii**: dacă lași o recenzie după o rezervare, păstrăm conținutul recenziei, nota acordată și prenumele asociat rezervării.

Nu colectăm date despre rasă, etnie, opinii politice, convingeri religioase, sănătate sau orientare sexuală.

## 3. Scopurile prelucrării

Prelucrăm datele tale pentru:

- **Furnizarea serviciului**: confirmarea, gestionarea și anularea rezervărilor, comunicarea cu restaurantul partener, transmiterea de e-mailuri de confirmare sau reamintire.
- **Recenzii post-vizită**: trimiterea unei invitații de recenzie după rezervare.
- **Securitate și prevenirea fraudelor**: detectarea utilizărilor abuzive, protecția conturilor.
- **Îmbunătățirea serviciului**: analiză agregată anonimizată (nu individuală) a utilizării platformei.
- **Conformare legală**: respectarea obligațiilor fiscale, contabile sau juridice aplicabile.

## 4. Temeiul legal

Temeiul legal pentru prelucrare, conform Regulamentului (UE) 2016/679 (GDPR), este:

- **Art. 6(1)(b) — executarea contractului**: pentru gestionarea rezervărilor, conturilor și serviciilor solicitate.
- **Art. 6(1)(c) — obligație legală**: pentru păstrarea datelor fiscale și contabile.
- **Art. 6(1)(f) — interes legitim**: pentru securitate, prevenirea fraudelor, îmbunătățirea serviciului.
- **Art. 6(1)(a) — consimțământ**: pentru comunicările opționale (newsletter, dacă există în viitor).

## 5. Cui transmitem datele

Datele tale pot fi accesate de:

- **Restaurantul ales** — primește numele, telefonul, adresa de e-mail, numărul de persoane, data, ora și notele tale, pentru a putea onora rezervarea.
- **Furnizorii noștri de servicii** (procesatori conform Art. 28 GDPR):
  - Supabase Inc. (SUA) — bază de date și autentificare, cu Standard Contractual Clauses și certificare EU-US Data Privacy Framework.
  - Resend / furnizor e-mail tranzacțional — pentru transmiterea e-mailurilor de confirmare și recenzie.
  - Coolify / Hetzner (Germania) — găzduirea aplicației.
- **Autorități competente** — la cererea legală a unei autorități.

Nu vindem datele tale către terți și nu le folosim pentru publicitate țintită.

## 6. Transferuri internaționale

Anumite servicii (în special Supabase pentru baza de date) procesează datele în Statele Unite. Aceste transferuri se bazează pe Standard Contractual Clauses aprobate de Comisia Europeană și pe certificarea EU-US Data Privacy Framework a furnizorului.

## 7. Cât timp păstrăm datele

- **Datele de rezervare**: 36 de luni de la rezervare (pentru istoric, recenzii și obligații fiscale).
- **Datele de cont**: până la ștergerea contului, plus 12 luni pentru recuperare.
- **Jurnalele de server**: 30 de zile.
- **Recenzii publice**: păstrate cât timp restaurantul este pe platformă; recenzia se afișează doar cu prenumele.
- **Date contabile/fiscale**: 10 ani, conform legislației aplicabile.

## 8. Drepturile tale

Conform GDPR, ai următoarele drepturi:

- **Dreptul de acces** (Art. 15) — să afli ce date avem despre tine.
- **Dreptul la rectificare** (Art. 16) — să corectăm date inexacte.
- **Dreptul la ștergere** (Art. 17) — să-ți ștergem datele („dreptul de a fi uitat").
- **Dreptul la restricționare** (Art. 18) — să oprim prelucrarea în anumite cazuri.
- **Dreptul la portabilitate** (Art. 20) — să primești datele într-un format structurat.
- **Dreptul la opoziție** (Art. 21) — să te opui prelucrării bazate pe interes legitim.
- **Dreptul de a depune o plângere** la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP), [www.dataprotection.ro](https://www.dataprotection.ro).

Pentru exercitarea acestor drepturi, scrie-ne la <Placeholder name="email" />. Răspundem în maxim 30 de zile.

## 9. Cookie-uri și stocare locală

Folosim doar cookie-uri și stocare locală **strict necesare** pentru funcționarea serviciului — sesiunea de autentificare, preferințele de filtrare. Nu folosim cookie-uri de analiză sau de publicitate. Detalii în [Politica de cookie-uri](/cookie-uri).

## 10. Minori

Tavli nu este destinat persoanelor sub 16 ani. Dacă afli că un copil ne-a furnizat date, contactează-ne la <Placeholder name="email" /> și vom șterge informațiile.

## 11. Modificări

Putem actualiza această politică. Versiunea curentă este afișată întotdeauna pe această pagină, cu data ultimei actualizări. Modificările substanțiale vor fi anunțate prin e-mail sau pe pagina principală.

## 12. Contact

Pentru orice întrebare:
- E-mail GDPR: <Placeholder name="email" />
- E-mail general: <Placeholder name="contactEmail" />
- Adresă poștală: <Placeholder name="address" />
````

- [ ] **Step 2: Verify it builds**

Run:
```bash
npm run build 2>&1 | grep -E "error|privacy" | head -20
```

Expected: no "error" output mentioning `privacy.mdx`. (Build may still produce other unrelated output.)

- [ ] **Step 3: Commit**

```bash
git add src/content/legal/ro/privacy.mdx
git commit -m "feat(legal): RO Privacy Policy template"
```

---

## Task 6: RO Terms of Service MDX content

**Files:**
- Create: `src/content/legal/ro/terms.mdx`

- [ ] **Step 1: Create the file with full prose**

Create `src/content/legal/ro/terms.mdx`:

````mdx
import { Placeholder } from "@/components/legal/placeholder";

# Termeni și condiții

*Ultima actualizare: 12 mai 2026*

## 1. Acceptarea termenilor

Folosind platforma Tavli (denumită în continuare „Tavli", „Serviciul"), confirmi că ai citit, înțeles și accepți acești Termeni și Condiții. Dacă nu ești de acord, te rugăm să nu folosești Serviciul.

Tavli este furnizat de <Placeholder name="name" />, cu sediul în <Placeholder name="address" />, CUI <Placeholder name="cui" />, înregistrată la Registrul Comerțului sub numărul <Placeholder name="jNumber" />.

## 2. Descrierea serviciului

Tavli este o platformă care permite descoperirea și rezervarea de mese la restaurante partenere din România. Tavli nu este restaurant și nu pregătește, livrează sau servește alimente. Tavli **nu percepe taxe de la utilizatori** pentru efectuarea unei rezervări.

## 3. Eligibilitate și cont

Pentru a face o rezervare trebuie să ai cel puțin 16 ani și să furnizezi date corecte și actualizate (nume, telefon, e-mail). Ești responsabil de păstrarea în siguranță a credențialelor contului tău.

## 4. Rezervări

- **Confirmare**: o rezervare este considerată confirmată după ce primești e-mailul de confirmare.
- **Modificare și anulare**: poți anula gratuit folosind link-ul din e-mailul de confirmare sau la [pagina de anulare](/) cu tokenul tău.
- **Politica de anulare a restaurantului**: anumite restaurante pot avea propriile politici de anulare; acestea sunt afișate pe pagina restaurantului.
- **Neprezentare („no-show")**: în cazul a două sau mai multe neprezentări nemotivate în 12 luni, Tavli își rezervă dreptul de a restricționa accesul contului tău.

## 5. Recenzii

Poți lăsa o recenzie după ce ai onorat o rezervare. Tavli verifică originea recenziei (un singur review per rezervare). Recenzia se publică cu prenumele tău.

**Ce nu este permis:**
- Conținut neadevărat, defăimător sau care încalcă drepturile altora.
- Conținut comercial, spam sau promoțional.
- Limbaj obscen, discriminatoriu sau care incită la ură.

Tavli își rezervă dreptul de a șterge recenziile care încalcă aceste reguli, după notificarea autorului.

## 6. Utilizare permisă

Te angajezi să folosești Tavli doar în scop personal, legal și conform acestor termeni. **Sunt interzise**, fără a se limita la:

- Folosirea de roboți, scrapere sau alte mijloace automate de acces.
- Tentativele de a obține acces neautorizat la sisteme sau date.
- Folosirea Serviciului pentru a transmite spam, conținut ilegal sau dăunător.
- Crearea de rezervări fictive sau abuzive.

## 7. Proprietate intelectuală

Toate elementele Tavli — design, logo, cod, conținut editorial — sunt proprietatea <Placeholder name="name" /> sau a licențiatorilor noștri și sunt protejate de legea română și internațională a drepturilor de autor. Conținutul generat de utilizatori (recenzii) rămâne proprietatea utilizatorului, dar oferi Tavli o licență neexclusivă, mondială, gratuită pentru afișarea pe platformă.

## 8. Conținutul restaurantelor

Informațiile despre restaurante (meniu, prețuri, ore, fotografii) sunt furnizate de restaurantele partenere. Tavli depune eforturi rezonabile pentru a păstra informațiile actualizate, dar **nu garantează exactitatea**. În caz de neconcordanță, te rugăm să contactezi direct restaurantul.

## 9. Limitarea răspunderii

În măsura permisă de lege:

- Tavli nu răspunde pentru calitatea alimentelor, serviciilor sau experienței oferite de restaurantul partener.
- Tavli nu garantează disponibilitatea permanentă a Serviciului. Putem efectua mentenanță planificată sau neplanificată.
- Răspunderea totală a Tavli pentru orice daune este limitată la cea mai mare valoare dintre 100 RON sau valoarea taxelor efectiv plătite de tine în ultimele 12 luni (în prezent: 0 RON).

Nimic din acești termeni nu limitează răspunderea Tavli pentru daune cauzate prin neglijență gravă sau intenție, sau pentru orice altă răspundere care nu poate fi limitată prin lege.

## 10. Suspendare și încetare

Putem suspenda sau înceta accesul tău la Serviciu dacă încalci acești termeni, fără preaviz în caz de încălcări grave. Poți închide contul tău oricând trimițând un e-mail la <Placeholder name="email" />.

## 11. Legea aplicabilă și jurisdicția

Acești termeni sunt guvernați de legea română. Orice dispută se soluționează la instanțele competente din <Placeholder name="jurisdiction" />, cu excepția cazurilor în care legea impune o altă jurisdicție pentru protecția consumatorilor.

## 12. Soluționarea alternativă a litigiilor

Conform Ordonanței 38/2015, ai dreptul să apelezi la entități de soluționare alternativă a litigiilor (SAL):

- **ANPC** — Autoritatea Națională pentru Protecția Consumatorilor: [www.anpc.ro](https://www.anpc.ro)
- **Platforma SOL a UE**: [ec.europa.eu/consumers/odr](https://ec.europa.eu/consumers/odr)

Detalii în [Notificarea ANPC](/anpc).

## 13. Modificări

Putem actualiza acești termeni. Versiunea curentă este afișată pe această pagină. Modificările substanțiale vor fi notificate prin e-mail sau pe pagina principală cu cel puțin 30 de zile înainte de intrarea în vigoare.

## 14. Contact

Pentru orice întrebare legată de acești termeni:
- E-mail: <Placeholder name="contactEmail" />
- Adresă poștală: <Placeholder name="address" />
````

- [ ] **Step 2: Commit**

```bash
git add src/content/legal/ro/terms.mdx
git commit -m "feat(legal): RO Terms of Service template"
```

---

## Task 7: RO Cookie Policy MDX content

**Files:**
- Create: `src/content/legal/ro/cookies.mdx`

- [ ] **Step 1: Create the file**

Create `src/content/legal/ro/cookies.mdx`:

````mdx
import { Placeholder } from "@/components/legal/placeholder";

# Politica de cookie-uri

*Ultima actualizare: 12 mai 2026*

## 1. Ce sunt cookie-urile

Cookie-urile sunt fișiere mici de text stocate de browserul tău când vizitezi un site web. Ele permit site-ului să-ți recunoască dispozitivul la o vizită ulterioară. „Stocarea locală" (localStorage) este o tehnologie similară, mai modernă, care permite păstrarea preferințelor în browser.

## 2. Ce folosim noi

Tavli folosește **doar cookie-uri și stocare locală strict necesare** pentru funcționarea Serviciului:

### Cookie-uri esențiale

| Nume | Scop | Furnizor | Durată |
| --- | --- | --- | --- |
| `sb-*-auth-token` | Sesiune de autentificare | Supabase | Sesiune / 7 zile |
| `tavli_cookies_ack` | Memorează că ai văzut notificarea de cookie-uri | Tavli | 30 de zile |

### Stocare locală funcțională

| Cheie | Scop | Durată |
| --- | --- | --- |
| `tavli-saved-restaurants` | Lista ta de restaurante salvate (utilizatori neautentificați) | Permanent până la ștergere |
| `tavli-notifications-enabled` | Preferința ta de notificări | Permanent până la ștergere |
| `tavli-recent-searches` | Istoricul căutărilor recente | Permanent până la ștergere |

## 3. Ce NU folosim

Tavli **nu folosește**:

- Cookie-uri de analiză web (Google Analytics, Plausible, Mixpanel etc.)
- Cookie-uri de publicitate (Meta, Google Ads, TikTok etc.)
- Cookie-uri de urmărire cross-site
- Pixeli de tracking sau fingerprinting

Dacă acest lucru se schimbă în viitor, vom actualiza politica și vom solicita consimțământul tău explicit înainte de activarea oricărui cookie ne-esențial.

## 4. Cum să gestionezi cookie-urile

Poți șterge sau bloca cookie-urile din setările browserului tău. **Atenție**: blocarea cookie-urilor esențiale va împiedica funcționarea autentificării și a anumitor funcționalități.

- [Chrome](https://support.google.com/chrome/answer/95647)
- [Firefox](https://support.mozilla.org/ro/kb/cookies-informatii-pe-care-website-urile-le-stocheaz-pe)
- [Safari (macOS / iOS)](https://support.apple.com/ro-ro/guide/safari/sfri11471/mac)
- [Edge](https://support.microsoft.com/ro-ro/windows/eliminarea-cookie-urilor-din-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09)

## 5. Modificări

Putem actualiza această politică. Data ultimei actualizări apare în partea de sus a paginii.

## 6. Contact

Întrebări despre cookie-uri? Scrie-ne la <Placeholder name="email" />.
````

- [ ] **Step 2: Commit**

```bash
git add src/content/legal/ro/cookies.mdx
git commit -m "feat(legal): RO Cookie Policy template"
```

---

## Task 8: RO ANPC + SOL Notice MDX content

**Files:**
- Create: `src/content/legal/ro/anpc.mdx`

- [ ] **Step 1: Create the file**

Create `src/content/legal/ro/anpc.mdx`:

````mdx
import { Placeholder } from "@/components/legal/placeholder";

# Informații pentru consumatori — ANPC & SOL

*Ultima actualizare: 12 mai 2026*

## 1. Despre Tavli

Tavli este o platformă de descoperire și rezervare a meselor la restaurante, operată de <Placeholder name="name" /> (CUI <Placeholder name="cui" />), cu sediul în <Placeholder name="address" />.

Tavli **nu percepe taxe de la utilizatori** pentru efectuarea unei rezervări. Plata pentru servicii (mâncare, băutură) se efectuează direct la restaurantul ales, conform politicilor acestuia.

## 2. Drepturile tale ca consumator

Ca utilizator al Tavli, beneficiezi de protecția oferită de:

- **OUG 34/2014** privind protecția consumatorilor în contractele la distanță.
- **Legea 363/2007** privind combaterea practicilor comerciale incorecte.
- **OUG 38/2015** privind soluționarea alternativă a litigiilor.

## 3. Soluționarea alternativă a litigiilor (SAL)

În caz de dispută, ai dreptul să apelezi la entități de soluționare alternativă a litigiilor, ca o alternativă la procedurile judiciare:

### Autoritatea Națională pentru Protecția Consumatorilor (ANPC)

ANPC oferă proceduri SAL pentru disputele dintre consumatori și comercianți.

- **Site web**: [www.anpc.ro](https://www.anpc.ro)
- **Procedura SAL**: [anpc.ro/ce-este-sal](https://anpc.ro/ce-este-sal/)
- **Formular de sesizare**: [anpc.ro/sesizari-reclamatii](https://anpc.ro/sesizari-reclamatii)

### Platforma SOL (Soluționarea Online a Litigiilor)

Platforma Soluționarea Online a Litigiilor a Comisiei Europene oferă o procedură online pentru litigiile transfrontaliere.

- **Acces**: [ec.europa.eu/consumers/odr](https://ec.europa.eu/consumers/odr)

## 4. Cum să depui o plângere

**Pasul 1 — Contactează-ne direct**: scrie la <Placeholder name="contactEmail" />. Răspundem în maxim 14 zile lucrătoare.

**Pasul 2 — Dacă nu ești mulțumit de răspuns**: poți depune o sesizare la ANPC sau folosi platforma SOL.

## 5. Date de contact Tavli

- **Denumire**: <Placeholder name="name" />
- **CUI**: <Placeholder name="cui" />
- **Nr. Registrul Comerțului**: <Placeholder name="jNumber" />
- **Sediu**: <Placeholder name="address" />
- **E-mail**: <Placeholder name="contactEmail" />
- **Web**: [tavli.ro](https://tavli.ro)

## 6. Date de contact ANPC

- **Site web**: [www.anpc.ro](https://www.anpc.ro)
- **Telefon InfoCons**: 0219551
- **Adresă**: Bd. Aviatorilor nr. 72, Sector 1, București
````

- [ ] **Step 2: Commit**

```bash
git add src/content/legal/ro/anpc.mdx
git commit -m "feat(legal): RO ANPC + SOL notice"
```

---

## Task 9: EN Privacy Policy MDX content

**Files:**
- Create: `src/content/legal/en/privacy.mdx`

- [ ] **Step 1: Create the file**

Create `src/content/legal/en/privacy.mdx`:

````mdx
import { Placeholder } from "@/components/legal/placeholder";

# Privacy Policy

*Last updated: 12 May 2026*

## 1. Data Controller

The data controller for the Tavli platform (hereinafter "Tavli", "we", "our") is <Placeholder name="name" />, with registered office at <Placeholder name="address" />, registered with the Trade Registry under number <Placeholder name="jNumber" />, fiscal code <Placeholder name="cui" />.

For any question about the processing of your data, you can contact us at <Placeholder name="email" />.

## 2. What Data We Collect

We collect only the data necessary to provide the service:

- **Identification data**: first and last name (or pseudonym), email address, phone number — collected when you make a reservation or create an account.
- **Reservation data**: the restaurant, date, time, number of guests, any dietary preferences or notes addressed to the restaurant.
- **Account data** (optional): your preferences (saved restaurants, default city, notification preference) — stored in your browser (localStorage) and/or your Tavli account.
- **Technical data**: IP address, browser type, operating system, pages visited — collected via server logs for security and debugging.
- **Reviews**: if you leave a review after a reservation, we keep the review content, the rating, and the first name associated with the reservation.

We do not collect data on race, ethnicity, political opinions, religious beliefs, health, or sexual orientation.

## 3. Purposes of Processing

We process your data for:

- **Service delivery**: confirming, managing, and canceling reservations, communicating with the partner restaurant, sending confirmation or reminder emails.
- **Post-visit reviews**: sending a review invitation after the reservation.
- **Security and fraud prevention**: detecting abuse, protecting accounts.
- **Service improvement**: aggregate anonymized analysis (not individual) of platform usage.
- **Legal compliance**: meeting applicable tax, accounting, or legal obligations.

## 4. Legal Basis

The legal basis for processing, under Regulation (EU) 2016/679 (GDPR), is:

- **Art. 6(1)(b) — performance of a contract**: for managing reservations, accounts, and requested services.
- **Art. 6(1)(c) — legal obligation**: for retention of tax and accounting data.
- **Art. 6(1)(f) — legitimate interest**: for security, fraud prevention, service improvement.
- **Art. 6(1)(a) — consent**: for optional communications (newsletter, if introduced).

## 5. Recipients

Your data may be accessed by:

- **The chosen restaurant** — receives your name, phone number, email address, party size, date, time, and notes, in order to honor the reservation.
- **Our service providers** (processors under Art. 28 GDPR):
  - Supabase Inc. (USA) — database and authentication, with Standard Contractual Clauses and EU-US Data Privacy Framework certification.
  - Resend / transactional email provider — for sending confirmation and review emails.
  - Coolify / Hetzner (Germany) — application hosting.
- **Competent authorities** — at the legal request of an authority.

We do not sell your data to third parties and do not use it for targeted advertising.

## 6. International Transfers

Certain services (in particular Supabase for the database) process data in the United States. These transfers rely on Standard Contractual Clauses approved by the European Commission and the provider's EU-US Data Privacy Framework certification.

## 7. Retention Periods

- **Reservation data**: 36 months from the reservation (for history, reviews, and tax obligations).
- **Account data**: until account deletion, plus 12 months for recovery.
- **Server logs**: 30 days.
- **Public reviews**: kept for as long as the restaurant is on the platform; the review is displayed with only the first name.
- **Accounting/tax data**: 10 years, as required by applicable law.

## 8. Your Rights

Under GDPR, you have the following rights:

- **Right of access** (Art. 15) — to learn what data we hold about you.
- **Right to rectification** (Art. 16) — to have inaccurate data corrected.
- **Right to erasure** (Art. 17) — to have your data deleted ("right to be forgotten").
- **Right to restriction** (Art. 18) — to halt processing in certain cases.
- **Right to portability** (Art. 20) — to receive your data in a structured format.
- **Right to object** (Art. 21) — to object to processing based on legitimate interest.
- **Right to lodge a complaint** with the Romanian National Supervisory Authority for Personal Data Processing (ANSPDCP), [www.dataprotection.ro](https://www.dataprotection.ro).

To exercise these rights, write to us at <Placeholder name="email" />. We respond within 30 days.

## 9. Cookies and Local Storage

We use only **strictly necessary** cookies and local storage for the operation of the Service — authentication session, filter preferences. We do not use analytics or advertising cookies. Details in the [Cookie Policy](/en/cookies).

## 10. Minors

Tavli is not intended for persons under 16. If you discover that a child has provided us with data, contact us at <Placeholder name="email" /> and we will delete the information.

## 11. Changes

We may update this policy. The current version is always shown on this page, with the date of the last update. Substantial changes will be announced via email or on the main page.

## 12. Contact

For any question:
- GDPR email: <Placeholder name="email" />
- General email: <Placeholder name="contactEmail" />
- Postal address: <Placeholder name="address" />
````

- [ ] **Step 2: Commit**

```bash
git add src/content/legal/en/privacy.mdx
git commit -m "feat(legal): EN Privacy Policy template"
```

---

## Task 10: EN Terms of Service MDX content

**Files:**
- Create: `src/content/legal/en/terms.mdx`

- [ ] **Step 1: Create the file**

Create `src/content/legal/en/terms.mdx`:

````mdx
import { Placeholder } from "@/components/legal/placeholder";

# Terms of Service

*Last updated: 12 May 2026*

## 1. Acceptance of Terms

By using the Tavli platform (hereinafter "Tavli", "the Service"), you confirm that you have read, understood, and accept these Terms of Service. If you do not agree, please do not use the Service.

Tavli is provided by <Placeholder name="name" />, with registered office at <Placeholder name="address" />, fiscal code <Placeholder name="cui" />, registered with the Trade Registry under number <Placeholder name="jNumber" />.

## 2. Description of the Service

Tavli is a platform that enables the discovery and reservation of tables at partner restaurants in Romania. Tavli is not a restaurant and does not prepare, deliver, or serve food. Tavli **does not charge users fees** for making a reservation.

## 3. Eligibility and Account

To make a reservation you must be at least 16 years old and provide accurate, up-to-date information (name, phone, email). You are responsible for keeping your account credentials secure.

## 4. Reservations

- **Confirmation**: a reservation is considered confirmed once you receive the confirmation email.
- **Modification and cancellation**: you can cancel free of charge using the link in your confirmation email or via the [cancellation page](/) with your token.
- **Restaurant cancellation policy**: certain restaurants may have their own cancellation policies; these are shown on the restaurant page.
- **No-shows**: in the case of two or more unjustified no-shows within 12 months, Tavli reserves the right to restrict access to your account.

## 5. Reviews

You can leave a review after honoring a reservation. Tavli verifies the source of the review (one review per reservation). The review is published with your first name.

**What is not allowed:**
- Untrue, defamatory content or content that infringes the rights of others.
- Commercial content, spam, or promotion.
- Obscene, discriminatory, or hateful language.

Tavli reserves the right to remove reviews that violate these rules, after notice to the author.

## 6. Permitted Use

You agree to use Tavli for personal, lawful purposes and in accordance with these terms. **The following are prohibited**, without limitation:

- Use of bots, scrapers, or other automated means of access.
- Attempts to gain unauthorized access to systems or data.
- Use of the Service to transmit spam, illegal, or harmful content.
- Creation of fake or abusive reservations.

## 7. Intellectual Property

All elements of Tavli — design, logo, code, editorial content — are the property of <Placeholder name="name" /> or our licensors and are protected by Romanian and international copyright law. User-generated content (reviews) remains the property of the user, but you grant Tavli a non-exclusive, worldwide, royalty-free license to display it on the platform.

## 8. Restaurant Content

Information about restaurants (menu, prices, hours, photos) is provided by partner restaurants. Tavli takes reasonable efforts to keep information up to date, but **does not guarantee accuracy**. In case of discrepancy, please contact the restaurant directly.

## 9. Limitation of Liability

To the extent permitted by law:

- Tavli is not liable for the quality of food, service, or experience provided by the partner restaurant.
- Tavli does not guarantee permanent availability of the Service. We may perform planned or unplanned maintenance.
- Tavli's total liability for any damages is limited to the greater of RON 100 or the value of fees actually paid by you in the past 12 months (currently: RON 0).

Nothing in these terms limits Tavli's liability for damages caused by gross negligence or intent, or for any other liability that cannot be limited under law.

## 10. Suspension and Termination

We may suspend or terminate your access to the Service if you violate these terms, without prior notice in the case of serious violations. You can close your account at any time by emailing <Placeholder name="email" />.

## 11. Governing Law and Jurisdiction

These terms are governed by Romanian law. Any dispute is to be resolved by the competent courts in <Placeholder name="jurisdiction" />, except where the law requires another jurisdiction for consumer protection.

## 12. Alternative Dispute Resolution

Under Government Ordinance 38/2015, you have the right to use alternative dispute resolution (ADR) entities:

- **ANPC** — National Authority for Consumer Protection: [www.anpc.ro](https://www.anpc.ro)
- **EU ODR platform**: [ec.europa.eu/consumers/odr](https://ec.europa.eu/consumers/odr)

Details in the [ANPC Notice](/en/anpc).

## 13. Changes

We may update these terms. The current version is shown on this page. Substantial changes will be notified via email or on the main page at least 30 days before they enter into force.

## 14. Contact

For any question about these terms:
- Email: <Placeholder name="contactEmail" />
- Postal address: <Placeholder name="address" />
````

- [ ] **Step 2: Commit**

```bash
git add src/content/legal/en/terms.mdx
git commit -m "feat(legal): EN Terms of Service template"
```

---

## Task 11: EN Cookie Policy MDX content

**Files:**
- Create: `src/content/legal/en/cookies.mdx`

- [ ] **Step 1: Create the file**

Create `src/content/legal/en/cookies.mdx`:

````mdx
import { Placeholder } from "@/components/legal/placeholder";

# Cookie Policy

*Last updated: 12 May 2026*

## 1. What Cookies Are

Cookies are small text files stored by your browser when you visit a website. They allow the website to recognize your device on a subsequent visit. "Local storage" (localStorage) is a similar, more modern technology that lets preferences persist in the browser.

## 2. What We Use

Tavli uses **only strictly necessary cookies and local storage** for the operation of the Service:

### Essential cookies

| Name | Purpose | Provider | Duration |
| --- | --- | --- | --- |
| `sb-*-auth-token` | Authentication session | Supabase | Session / 7 days |
| `tavli_cookies_ack` | Remembers that you've seen the cookie notice | Tavli | 30 days |

### Functional local storage

| Key | Purpose | Duration |
| --- | --- | --- |
| `tavli-saved-restaurants` | Your saved-restaurants list (anonymous users) | Until cleared |
| `tavli-notifications-enabled` | Your notification preference | Until cleared |
| `tavli-recent-searches` | Recent search history | Until cleared |

## 3. What We Don't Use

Tavli **does not use**:

- Web analytics cookies (Google Analytics, Plausible, Mixpanel, etc.)
- Advertising cookies (Meta, Google Ads, TikTok, etc.)
- Cross-site tracking cookies
- Tracking pixels or fingerprinting

If this changes in the future, we'll update the policy and request your explicit consent before activating any non-essential cookie.

## 4. How to Manage Cookies

You can delete or block cookies in your browser settings. **Warning**: blocking essential cookies will prevent authentication and certain functionality from working.

- [Chrome](https://support.google.com/chrome/answer/95647)
- [Firefox](https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer)
- [Safari (macOS / iOS)](https://support.apple.com/en-us/guide/safari/sfri11471/mac)
- [Edge](https://support.microsoft.com/en-us/windows/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09)

## 5. Changes

We may update this policy. The date of the last update is shown at the top of the page.

## 6. Contact

Questions about cookies? Write to us at <Placeholder name="email" />.
````

- [ ] **Step 2: Commit**

```bash
git add src/content/legal/en/cookies.mdx
git commit -m "feat(legal): EN Cookie Policy template"
```

---

## Task 12: EN ANPC + SOL Notice MDX content

**Files:**
- Create: `src/content/legal/en/anpc.mdx`

- [ ] **Step 1: Create the file**

Create `src/content/legal/en/anpc.mdx`:

````mdx
import { Placeholder } from "@/components/legal/placeholder";

# Consumer Information — ANPC & ODR

*Last updated: 12 May 2026*

## 1. About Tavli

Tavli is a platform for discovering and booking tables at restaurants, operated by <Placeholder name="name" /> (fiscal code <Placeholder name="cui" />), with registered office at <Placeholder name="address" />.

Tavli **does not charge users fees** for making a reservation. Payment for services (food, beverage) is made directly at the restaurant of your choice, according to its policies.

## 2. Your Rights as a Consumer

As a user of Tavli, you benefit from the protection offered by:

- **Government Emergency Ordinance 34/2014** on consumer protection in distance contracts.
- **Law 363/2007** on combating unfair commercial practices.
- **Government Emergency Ordinance 38/2015** on alternative dispute resolution.

## 3. Alternative Dispute Resolution (ADR)

In case of a dispute, you have the right to use ADR entities as an alternative to judicial proceedings:

### National Authority for Consumer Protection (ANPC)

ANPC offers ADR procedures for disputes between consumers and traders.

- **Website**: [www.anpc.ro](https://www.anpc.ro)
- **ADR procedure**: [anpc.ro/ce-este-sal](https://anpc.ro/ce-este-sal/)
- **Complaint form**: [anpc.ro/sesizari-reclamatii](https://anpc.ro/sesizari-reclamatii)

### EU ODR Platform

The European Commission's Online Dispute Resolution platform offers an online procedure for cross-border disputes.

- **Access**: [ec.europa.eu/consumers/odr](https://ec.europa.eu/consumers/odr)

## 4. How to File a Complaint

**Step 1 — Contact us directly**: write to <Placeholder name="contactEmail" />. We respond within 14 working days.

**Step 2 — If you are not satisfied with the response**: you can file a complaint with ANPC or use the EU ODR platform.

## 5. Tavli Contact Information

- **Name**: <Placeholder name="name" />
- **Fiscal code**: <Placeholder name="cui" />
- **Trade Registry number**: <Placeholder name="jNumber" />
- **Address**: <Placeholder name="address" />
- **Email**: <Placeholder name="contactEmail" />
- **Web**: [tavli.ro](https://tavli.ro)

## 6. ANPC Contact Information

- **Website**: [www.anpc.ro](https://www.anpc.ro)
- **InfoCons phone**: 0219551
- **Address**: Bd. Aviatorilor nr. 72, Sector 1, Bucharest
````

- [ ] **Step 2: Commit**

```bash
git add src/content/legal/en/anpc.mdx
git commit -m "feat(legal): EN ANPC + ODR notice"
```

---

## Task 13: Eight legal-page route files

**Files:**
- Create: `src/app/(legal)/confidentialitate/page.tsx`
- Create: `src/app/(legal)/termeni/page.tsx`
- Create: `src/app/(legal)/cookie-uri/page.tsx`
- Create: `src/app/(legal)/anpc/page.tsx`
- Create: `src/app/(legal)/en/privacy/page.tsx`
- Create: `src/app/(legal)/en/terms/page.tsx`
- Create: `src/app/(legal)/en/cookies/page.tsx`
- Create: `src/app/(legal)/en/anpc/page.tsx`

Each is a thin server-component wrapper that imports its MDX content. They all follow the same pattern.

- [ ] **Step 1: Create `src/app/(legal)/confidentialitate/page.tsx`**

```tsx
import type { Metadata } from "next";
import Privacy from "@/content/legal/ro/privacy.mdx";

export const metadata: Metadata = {
  title: "Politica de confidențialitate — Tavli",
  description: "Cum colectăm, folosim și protejăm datele tale personale pe Tavli.",
};

export default function Page() {
  return <Privacy />;
}
```

- [ ] **Step 2: Create `src/app/(legal)/termeni/page.tsx`**

```tsx
import type { Metadata } from "next";
import Terms from "@/content/legal/ro/terms.mdx";

export const metadata: Metadata = {
  title: "Termeni și condiții — Tavli",
  description: "Termenii de utilizare ai platformei Tavli.",
};

export default function Page() {
  return <Terms />;
}
```

- [ ] **Step 3: Create `src/app/(legal)/cookie-uri/page.tsx`**

```tsx
import type { Metadata } from "next";
import Cookies from "@/content/legal/ro/cookies.mdx";

export const metadata: Metadata = {
  title: "Politica de cookie-uri — Tavli",
  description: "Ce cookie-uri folosim pe Tavli și cum le poți gestiona.",
};

export default function Page() {
  return <Cookies />;
}
```

- [ ] **Step 4: Create `src/app/(legal)/anpc/page.tsx`**

```tsx
import type { Metadata } from "next";
import Anpc from "@/content/legal/ro/anpc.mdx";

export const metadata: Metadata = {
  title: "ANPC & SOL — Tavli",
  description: "Informații pentru consumatori și soluționarea alternativă a litigiilor.",
};

export default function Page() {
  return <Anpc />;
}
```

- [ ] **Step 5: Create `src/app/(legal)/en/privacy/page.tsx`**

```tsx
import type { Metadata } from "next";
import Privacy from "@/content/legal/en/privacy.mdx";

export const metadata: Metadata = {
  title: "Privacy Policy — Tavli",
  description: "How we collect, use, and protect your personal data on Tavli.",
};

export default function Page() {
  return <Privacy />;
}
```

- [ ] **Step 6: Create `src/app/(legal)/en/terms/page.tsx`**

```tsx
import type { Metadata } from "next";
import Terms from "@/content/legal/en/terms.mdx";

export const metadata: Metadata = {
  title: "Terms of Service — Tavli",
  description: "The terms of use of the Tavli platform.",
};

export default function Page() {
  return <Terms />;
}
```

- [ ] **Step 7: Create `src/app/(legal)/en/cookies/page.tsx`**

```tsx
import type { Metadata } from "next";
import Cookies from "@/content/legal/en/cookies.mdx";

export const metadata: Metadata = {
  title: "Cookie Policy — Tavli",
  description: "Which cookies we use on Tavli and how to manage them.",
};

export default function Page() {
  return <Cookies />;
}
```

- [ ] **Step 8: Create `src/app/(legal)/en/anpc/page.tsx`**

```tsx
import type { Metadata } from "next";
import Anpc from "@/content/legal/en/anpc.mdx";

export const metadata: Metadata = {
  title: "Consumer Info — ANPC & ODR — Tavli",
  description: "Consumer protection information and alternative dispute resolution.",
};

export default function Page() {
  return <Anpc />;
}
```

- [ ] **Step 9: Verify the build picks up all eight routes**

Run:
```bash
npm run build 2>&1 | grep -E "confidentialitate|termeni|cookie-uri|anpc|en/privacy|en/terms|en/cookies|en/anpc"
```

Expected: all eight routes appear in the build output (typically as `Generating static pages` lines).

- [ ] **Step 10: Commit**

```bash
git add "src/app/(legal)"
git commit -m "feat(legal): 8 routes (4 RO + 4 EN) wired to MDX content"
```

---

## Task 14: Structural-parity test for RO/EN content

**Files:**
- Create: `src/content/legal/__tests__/parity.test.ts`

- [ ] **Step 1: Write the parity test**

Create `src/content/legal/__tests__/parity.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOCS = ["privacy", "terms", "cookies", "anpc"] as const;

function extractHeadingLevels(mdxPath: string): string[] {
  const content = readFileSync(mdxPath, "utf8");
  const levels: string[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^(#{1,6})\s/);
    if (m) levels.push(m[1]);
  }
  return levels;
}

describe("legal content RO/EN structural parity", () => {
  it.each(DOCS)(
    "%s: RO and EN have identical heading-level sequences",
    (doc) => {
      const roPath = resolve(__dirname, `../ro/${doc}.mdx`);
      const enPath = resolve(__dirname, `../en/${doc}.mdx`);
      const ro = extractHeadingLevels(roPath);
      const en = extractHeadingLevels(enPath);
      expect(en).toEqual(ro);
    },
  );
});
```

- [ ] **Step 2: Run it**

Run:
```bash
npx jest src/content/legal/__tests__/parity.test.ts
```

Expected: 4 tests PASS. If any fail, the failing language pair has drifted in heading structure — fix the document so the heading sequences match.

- [ ] **Step 3: Commit**

```bash
git add src/content/legal/__tests__/parity.test.ts
git commit -m "test(legal): structural parity between RO and EN docs"
```

---

## Task 15: `<CookieFootnote>` component (TDD)

**Files:**
- Create: `src/components/legal/cookie-footnote.tsx`
- Create: `src/components/__tests__/cookie-footnote.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/cookie-footnote.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { CookieFootnote } from "@/components/legal/cookie-footnote";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

const usePathnameMock = usePathname as jest.MockedFunction<typeof usePathname>;

describe("<CookieFootnote>", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders RO copy on non-/en routes", () => {
    usePathnameMock.mockReturnValue("/bucuresti");
    render(<CookieFootnote />);
    expect(screen.getByText(/cookie-uri esențiale/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Detalii/ })).toHaveAttribute(
      "href",
      "/cookie-uri",
    );
  });

  it("renders EN copy on /en routes", () => {
    usePathnameMock.mockReturnValue("/en/privacy");
    render(<CookieFootnote />);
    expect(screen.getByText(/essential cookies/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Details/ })).toHaveAttribute(
      "href",
      "/en/cookies",
    );
  });

  it("hides after the user acknowledges", () => {
    usePathnameMock.mockReturnValue("/bucuresti");
    render(<CookieFootnote />);
    fireEvent.click(screen.getByRole("button", { name: /OK/i }));
    expect(screen.queryByText(/cookie-uri esențiale/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem("tavli_cookies_ack")).not.toBeNull();
  });

  it("does not render on legal policy routes", () => {
    usePathnameMock.mockReturnValue("/confidentialitate");
    const { container } = render(<CookieFootnote />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx jest src/components/__tests__/cookie-footnote.test.tsx
```

Expected: FAIL — "Cannot find module '@/components/legal/cookie-footnote'".

- [ ] **Step 3: Implement the component**

Create `src/components/legal/cookie-footnote.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "tavli_cookies_ack";
const REPROMPT_AFTER_DAYS = 30;

const LEGAL_PATHS = new Set([
  "/confidentialitate",
  "/termeni",
  "/cookie-uri",
  "/anpc",
  "/en/privacy",
  "/en/terms",
  "/en/cookies",
  "/en/anpc",
]);

const COPY = {
  ro: {
    body: "🍪 Folosim cookie-uri esențiale pentru autentificare și preferințe. Nu te urmărim.",
    details: "Detalii",
    ok: "OK",
    detailsHref: "/cookie-uri",
  },
  en: {
    body: "🍪 We use essential cookies for login and preferences. No tracking.",
    details: "Details",
    ok: "OK",
    detailsHref: "/en/cookies",
  },
};

function isStillAcknowledged(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  const ackTimestamp = Number(raw);
  if (Number.isNaN(ackTimestamp)) return false;
  const ageDays = (Date.now() - ackTimestamp) / (1000 * 60 * 60 * 24);
  return ageDays < REPROMPT_AFTER_DAYS;
}

export function CookieFootnote() {
  const pathname = usePathname();
  const [acknowledged, setAcknowledged] = useState(true);

  useEffect(() => {
    setAcknowledged(isStillAcknowledged());
  }, []);

  if (LEGAL_PATHS.has(pathname)) return null;
  if (acknowledged) return null;

  const lang = pathname.startsWith("/en") ? "en" : "ro";
  const copy = COPY[lang];

  const handleAck = () => {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setAcknowledged(true);
  };

  return (
    <div
      role="region"
      aria-label={lang === "ro" ? "Notificare cookie-uri" : "Cookie notice"}
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface-white border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.04)]"
    >
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3 desktop:rounded-card desktop:mb-4 desktop:border desktop:shadow-card">
        <p className="text-sm text-text-primary flex-1">{copy.body}</p>
        <Link
          href={copy.detailsHref}
          className="text-sm font-semibold text-brand-primary hover:underline whitespace-nowrap"
        >
          {copy.details}
        </Link>
        <button
          type="button"
          onClick={handleAck}
          className="text-sm font-bold rounded-button bg-brand-primary text-white px-4 py-1.5 hover:bg-brand-primary-dark"
        >
          {copy.ok}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx jest src/components/__tests__/cookie-footnote.test.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/legal/cookie-footnote.tsx src/components/__tests__/cookie-footnote.test.tsx
git commit -m "feat(legal): CookieFootnote with RO/EN copy and 30-day re-prompt"
```

---

## Task 16: Mount `<CookieFootnote>` in root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add the import and mount**

In `src/app/layout.tsx`, add an import:

```tsx
import { CookieFootnote } from "@/components/legal/cookie-footnote";
```

Then change the `<body>` content from:

```tsx
<body className="font-sans">
  {children}
  <Toaster />
</body>
```

to:

```tsx
<body className="font-sans">
  {children}
  <Toaster />
  <CookieFootnote />
</body>
```

- [ ] **Step 2: Verify the dev server still boots**

Run (in one terminal):
```bash
npm run dev
```

Visit `http://localhost:3000/bucuresti` in a browser — confirm the cookie banner appears at the bottom. Click [OK] — confirm it dismisses. Reload — confirm it stays dismissed. Visit `/confidentialitate` — confirm the banner is hidden.

Stop the dev server (Ctrl-C).

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(legal): mount CookieFootnote globally"
```

---

## Task 17: `<SiteFooter>` component (TDD)

**Files:**
- Create: `src/components/site-footer.tsx`
- Create: `src/components/__tests__/site-footer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/site-footer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

const usePathnameMock = usePathname as jest.MockedFunction<typeof usePathname>;

describe("<SiteFooter>", () => {
  it("renders on consumer routes", () => {
    usePathnameMock.mockReturnValue("/bucuresti");
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByText(/Confidențialitate/)).toBeInTheDocument();
  });

  it("does not render on /admin/* routes", () => {
    usePathnameMock.mockReturnValue("/admin/restaurants");
    const { container } = render(<SiteFooter />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not render on /partner/* routes", () => {
    usePathnameMock.mockReturnValue("/partner/reservations");
    const { container } = render(<SiteFooter />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders ANPC and EU ODR external links with rel='noopener noreferrer'", () => {
    usePathnameMock.mockReturnValue("/bucuresti");
    render(<SiteFooter />);
    const anpc = screen.getByRole("link", { name: /ANPC SAL/i });
    const odr = screen.getByRole("link", { name: /EU ODR/i });
    expect(anpc).toHaveAttribute("href", "https://anpc.ro/ce-este-sal/");
    expect(anpc).toHaveAttribute("rel", "noopener noreferrer");
    expect(anpc).toHaveAttribute("target", "_blank");
    expect(odr).toHaveAttribute("href", "https://ec.europa.eu/consumers/odr");
    expect(odr).toHaveAttribute("rel", "noopener noreferrer");
    expect(odr).toHaveAttribute("target", "_blank");
  });

  it("language switcher swaps RO ↔ EN for paired legal routes", () => {
    usePathnameMock.mockReturnValue("/confidentialitate");
    render(<SiteFooter />);
    const switcher = screen.getByRole("link", { name: /English/i });
    expect(switcher).toHaveAttribute("href", "/en/privacy");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx jest src/components/__tests__/site-footer.test.tsx
```

Expected: FAIL — "Cannot find module '@/components/site-footer'".

- [ ] **Step 3: Implement the component**

Create `src/components/site-footer.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Scale } from "lucide-react";

const HIDDEN_PREFIXES = ["/admin", "/partner", "/onboard", "/reservations", "/reviews"];

const ROUTE_PAIRS: Record<string, string> = {
  "/confidentialitate": "/en/privacy",
  "/termeni": "/en/terms",
  "/cookie-uri": "/en/cookies",
  "/anpc": "/en/anpc",
  "/en/privacy": "/confidentialitate",
  "/en/terms": "/termeni",
  "/en/cookies": "/cookie-uri",
  "/en/anpc": "/anpc",
};

function pairedRouteFor(pathname: string): { href: string; label: string } {
  if (pathname in ROUTE_PAIRS) {
    const href = ROUTE_PAIRS[pathname];
    return {
      href,
      label: href.startsWith("/en") ? "English" : "Română",
    };
  }
  return pathname.startsWith("/en") ? { href: "/", label: "Română" } : { href: "/en/privacy", label: "English" };
}

export function SiteFooter() {
  const pathname = usePathname();
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const isEn = pathname.startsWith("/en");
  const t = isEn ? COPY.en : COPY.ro;
  const langPair = pairedRouteFor(pathname);

  return (
    <footer
      className="hidden desktop:block border-t border-border bg-surface-white mt-16"
      role="contentinfo"
    >
      <div className="max-w-[var(--container-content)] mx-auto px-6 py-10 grid grid-cols-3 gap-8">
        <div>
          <p className="font-display text-xl font-bold text-brand-primary leading-none">Tavli</p>
          <p className="text-sm text-text-muted mt-2">{t.tagline}</p>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">{t.aboutHeader}</h4>
          <ul className="space-y-2 text-sm">
            <li><span className="text-text-muted cursor-not-allowed" aria-disabled>{t.howItWorks}</span></li>
            <li><span className="text-text-muted cursor-not-allowed" aria-disabled>{t.forRestaurants}</span></li>
            <li><a href={`mailto:hello@tavli.ro`} className="text-text-secondary hover:text-text-primary">{t.contact}</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">{t.legalHeader}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href={isEn ? "/en/privacy" : "/confidentialitate"} className="text-text-secondary hover:text-text-primary">{t.privacy}</Link></li>
            <li><Link href={isEn ? "/en/terms" : "/termeni"} className="text-text-secondary hover:text-text-primary">{t.terms}</Link></li>
            <li><Link href={isEn ? "/en/cookies" : "/cookie-uri"} className="text-text-secondary hover:text-text-primary">{t.cookies}</Link></li>
            <li><Link href={isEn ? "/en/anpc" : "/anpc"} className="text-text-secondary hover:text-text-primary">{t.anpcLink}</Link></li>
          </ul>
        </div>
      </div>

      <div className="max-w-[var(--container-content)] mx-auto px-6 pb-8 flex items-center justify-between gap-4 border-t border-border pt-4">
        <div className="flex items-center gap-3">
          <a
            href="https://anpc.ro/ce-este-sal/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ANPC SAL"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary"
          >
            <ShieldCheck size={16} /> ANPC SAL
          </a>
          <a
            href="https://ec.europa.eu/consumers/odr"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="EU ODR"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary"
          >
            <Scale size={16} /> EU ODR
          </a>
        </div>
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <span>© {new Date().getFullYear()} Tavli</span>
          <Link href={langPair.href} className="font-semibold text-text-secondary hover:text-text-primary">
            {langPair.label}
          </Link>
        </div>
      </div>
    </footer>
  );
}

const COPY = {
  ro: {
    tagline: "Găsește-ți masa.",
    aboutHeader: "Despre",
    howItWorks: "Cum funcționează",
    forRestaurants: "Pentru restaurante",
    contact: "Contact",
    legalHeader: "Legal",
    privacy: "Confidențialitate",
    terms: "Termeni",
    cookies: "Cookie-uri",
    anpcLink: "ANPC",
  },
  en: {
    tagline: "Find your table.",
    aboutHeader: "About",
    howItWorks: "How it works",
    forRestaurants: "For restaurants",
    contact: "Contact",
    legalHeader: "Legal",
    privacy: "Privacy",
    terms: "Terms",
    cookies: "Cookies",
    anpcLink: "ANPC",
  },
} as const;
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx jest src/components/__tests__/site-footer.test.tsx
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/site-footer.tsx src/components/__tests__/site-footer.test.tsx
git commit -m "feat(legal): SiteFooter with legal links + ANPC/EU ODR + lang switcher"
```

---

## Task 18: Mount `<SiteFooter>` in root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add the mount**

In `src/app/layout.tsx`, add the import:

```tsx
import { SiteFooter } from "@/components/site-footer";
```

Update the `<body>` content from:

```tsx
<body className="font-sans">
  {children}
  <Toaster />
  <CookieFootnote />
</body>
```

to:

```tsx
<body className="font-sans">
  {children}
  <SiteFooter />
  <Toaster />
  <CookieFootnote />
</body>
```

(Order: footer after main content but before global overlays; cookie banner last so it sits on top of everything.)

- [ ] **Step 2: Visual sanity check**

Run the dev server, visit `http://localhost:3000/bucuresti`, scroll to the bottom, confirm the footer appears with all four legal links + ANPC/EU ODR icons. Click "English" — confirm it routes to `/en/privacy`. Visit `/admin/sign-in` — confirm the footer is hidden.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(legal): mount SiteFooter globally (hidden on admin/partner)"
```

---

## Task 19: Add "Legal & informare" section to mobile profile

**Files:**
- Modify: `src/app/[city]/(shell)/profile/page.tsx`

- [ ] **Step 1: Locate the notification toggle and add the Legal section beneath it**

Open `src/app/[city]/(shell)/profile/page.tsx`. Find the closing of the notifications card section (search for `NOTIFICATIONS_STORAGE_KEY` usage in the JSX). Immediately after that card, add a new `<section>` block:

```tsx
{/* Legal & informare — mobile entry point (desktop has the footer). */}
<section className="bg-surface-white border border-border rounded-card mb-4 desktop:hidden">
  <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary px-4 pt-4 pb-2">
    Legal & informare
  </h2>
  <ul className="divide-y divide-border">
    {[
      { href: "/confidentialitate", label: "Confidențialitate" },
      { href: "/termeni", label: "Termeni" },
      { href: "/cookie-uri", label: "Cookie-uri" },
      { href: "/anpc", label: "ANPC & SOL" },
    ].map((item) => (
      <li key={item.href}>
        <a
          href={item.href}
          className="flex items-center justify-between px-4 py-3.5 text-sm text-text-primary hover:bg-surface-bg"
        >
          <span>{item.label}</span>
          <span aria-hidden className="text-text-muted">›</span>
        </a>
      </li>
    ))}
    <li>
      <a
        href="mailto:hello@tavli.ro"
        className="flex items-center justify-between px-4 py-3.5 text-sm text-text-primary hover:bg-surface-bg"
      >
        <span>Contact: hello@tavli.ro</span>
        <span aria-hidden className="text-text-muted">›</span>
      </a>
    </li>
  </ul>
</section>
```

- [ ] **Step 2: Sanity check the file still compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Visual sanity check**

Run dev server. Resize browser to mobile width (390px), visit `http://localhost:3000/bucuresti/profile`. Confirm the Legal section appears beneath the notifications toggle with all five rows. Tap each — confirm navigation works.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[city]/(shell)/profile/page.tsx"
git commit -m "feat(legal): mobile profile Legal & informare section"
```

---

## Task 20: ANPC strip on the reservation flow

**Files:**
- Modify: `src/components/reservation-sheet.tsx`

- [ ] **Step 1: Inspect the bottom of the reservation confirmation step**

Read the file to find where the confirmation step renders the submit button. Look for the last button or button group inside the JSX that contains `createReservation`. We want to add a small advisory line above (or just below) that button.

- [ ] **Step 2: Add the imports**

At the top of `src/components/reservation-sheet.tsx`, add to the existing imports:

```tsx
import { ShieldCheck, Scale } from "lucide-react";
import Link from "next/link";
```

(Check the file's existing imports first; if `Link` from `next/link` is already imported, don't add it again.)

- [ ] **Step 3: Add the ANPC strip JSX**

Inside the confirmation step's render, immediately above the primary submit button (the one that calls `createReservation`), insert this block:

```tsx
<div className="px-4 pb-3 pt-1">
  <p className="text-[11px] leading-snug text-text-muted text-center">
    Prin rezervare, accepți{" "}
    <Link href="/termeni" className="underline hover:text-text-secondary">Termenii</Link>
    {" "}și{" "}
    <Link href="/confidentialitate" className="underline hover:text-text-secondary">Politica de confidențialitate</Link>.
  </p>
  <div className="mt-2 flex items-center justify-center gap-4">
    <a
      href="https://anpc.ro/ce-este-sal/"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="ANPC SAL"
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted hover:text-text-secondary"
    >
      <ShieldCheck size={12} /> ANPC SAL
    </a>
    <a
      href="https://ec.europa.eu/consumers/odr"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="EU ODR"
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted hover:text-text-secondary"
    >
      <Scale size={12} /> EU ODR
    </a>
  </div>
</div>
```

- [ ] **Step 4: Run existing reservation-sheet tests**

Run:
```bash
npx jest src/components/__tests__/ -t reservation
```

Expected: existing tests still pass. (If a test does a snapshot or DOM count on the sheet, it may need a small update to accept the new strip.)

- [ ] **Step 5: Visual sanity check**

Run dev server. Open a restaurant detail page, trigger the reservation sheet, advance to the confirmation step. Confirm the new strip appears above the submit button with both ANPC and EU ODR links.

- [ ] **Step 6: Commit**

```bash
git add src/components/reservation-sheet.tsx
git commit -m "feat(legal): ANPC + terms-acceptance strip on reservation flow"
```

---

## Task 21: Full build + route smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npm test
```

Expected: all tests pass, including the 14 new ones added in this plan (2 Placeholder + 4 CookieFootnote + 5 SiteFooter + 4 parity-test entries × 1 doc each = 17 new test assertions across 4 files; check the count matches roughly).

- [ ] **Step 2: Run a clean build**

Run:
```bash
rm -rf .next
npm run build
```

Expected: build completes. Look for the eight new routes in the build summary: `/confidentialitate`, `/termeni`, `/cookie-uri`, `/anpc`, `/en/privacy`, `/en/terms`, `/en/cookies`, `/en/anpc`. All should be statically generated.

- [ ] **Step 3: Local route smoke**

Start the dev server (`npm run dev`). Open each of the 8 routes in a browser and confirm:
- The page renders without errors.
- The "REVIEW BEFORE LAUNCH" dev banner is visible at the top (orange, sticky).
- All `<Placeholder>` values appear inside dashed-orange boxes labeled "PLACEHOLDER".
- The cookie banner does NOT appear on any legal route.
- The footer renders at the bottom on desktop with the language switcher; clicking "English" / "Română" navigates to the paired route.

Routes to visit:
```
http://localhost:3000/confidentialitate
http://localhost:3000/termeni
http://localhost:3000/cookie-uri
http://localhost:3000/anpc
http://localhost:3000/en/privacy
http://localhost:3000/en/terms
http://localhost:3000/en/cookies
http://localhost:3000/en/anpc
```

Stop the dev server.

- [ ] **Step 4: Commit any final tweaks**

If steps 1–3 surfaced any issues that required small fixes:
```bash
git add -p   # selectively stage the relevant hunks
git commit -m "fix(legal): post-smoke tweaks"
```

If nothing changed, skip this step.

- [ ] **Step 5: Push and trigger Coolify deploy**

```bash
git push origin main
```

User: trigger Coolify deploy from your panel when ready.

- [ ] **Step 6: Prod smoke after deploy**

(Once user confirms Coolify deploy is complete.)

Run:
```bash
for path in /confidentialitate /termeni /cookie-uri /anpc /en/privacy /en/terms /en/cookies /en/anpc; do
  echo -n "$path: "
  curl -s -o /dev/null -w "%{http_code}\n" "https://tavli.ro$path?cb=$(date +%s)"
done
```

Expected: eight `200` responses.

Open `https://tavli.ro/confidentialitate` and `https://tavli.ro/en/privacy` in a browser; confirm:
- Pages render with prose.
- Placeholders appear as plain text (no dashed-orange box — that's dev-only).
- The "REVIEW BEFORE LAUNCH" dev banner is NOT visible (it's gated to `NODE_ENV !== "production"`).
- The cookie banner appears for a first-time visitor.
- The desktop footer is rendered.

Confirm `mailto:privacy@tavli.ro` is set up by sending a test email to that address.

---

## Done

All eight legal routes live, cookie banner active, footer + mobile profile + reservation strip wired. Action items remain for the user:

1. Replace `ENTITY` values in `src/content/legal/entity.ts` once the legal entity is registered.
2. Schedule lawyer review of the templates before any partner outreach or paid acquisition.
3. Configure `privacy@tavli.ro` as a real inbox / alias.
