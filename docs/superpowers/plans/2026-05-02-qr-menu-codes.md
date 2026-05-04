# QR Menu Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurant owners can print branded "Warm Playful" QR codes from `/partner/menu/qr`; diners who scan land on a minimal `/<city>/<slug>/menu` view (no booking, no reviews — just the menu).

**Architecture:** Two new routes (one diner-facing, one partner-facing) plus one shared `MenuQrCard` component that wraps the `qr-code-styling` library with the locked Style B configuration. Print is the only action button — `window.print()` plus `@media print` CSS. No DB changes, no migrations, no API endpoints.

**Tech Stack:** Next.js 16 App Router (server components default), React 19, Tailwind 4, `qr-code-styling@1.6.x` (new dep, partner-only bundle), Jest + React Testing Library (jsdom).

**Reference spec:** `docs/superpowers/specs/2026-05-02-qr-menu-codes-design.md`

---

## File Map

**New files:**
- `src/components/menu-qr-card.tsx` — leaf client component: branded card + embedded styled QR
- `src/components/__tests__/menu-qr-card.test.tsx`
- `src/app/[city]/[slug]/menu/page.tsx` — diner-facing minimal menu view (server component)
- `src/app/[city]/[slug]/menu/__tests__/page.test.tsx`
- `src/app/partner/(dashboard)/menu/qr/page.tsx` — partner-facing preview/print page (server component)
- `src/app/partner/(dashboard)/menu/qr/MenuQrPreview.tsx` — client component: layout toggle + Print button
- `src/app/partner/(dashboard)/menu/qr/__tests__/MenuQrPreview.test.tsx`
- `src/app/partner/(dashboard)/menu/qr/qr-print.css` — page-level print rules (`@page A4`, hide-chrome, avoid-page-break)

**Modified:**
- `src/app/partner/(dashboard)/menu/page.tsx` — add gated "Print QR" button at top
- `src/app/partner/(dashboard)/menu/__tests__/page.test.tsx` — new test file if none exists, otherwise extend
- `package.json` + `package-lock.json` — add `qr-code-styling`

---

## Task 1: Install `qr-code-styling`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the dependency**

Run from `/Users/henricktissink/Sauce/masaro`:
```bash
npm install qr-code-styling@^1.6.0
```

Expected: `npm` adds `qr-code-styling` to `dependencies` and updates `package-lock.json`. No errors.

- [ ] **Step 2: Verify the import resolves**

Run:
```bash
node -e "console.log(typeof require('qr-code-styling').default)"
```

Expected output: `function`

- [ ] **Step 3: Verify nothing else broke**

Run:
```bash
npm test
```

Expected: all existing tests still pass (382 tests across 59 suites at the start of this plan).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add qr-code-styling dep for QR menu codes"
```

---

## Task 2: `MenuQrCard` component

**Files:**
- Create: `src/components/menu-qr-card.tsx`
- Create: `src/components/__tests__/menu-qr-card.test.tsx`

The leaf component. Owns the locked Style B configuration so callers don't decide colors/shapes. Renders a card with the decorative ✦ glyph, restaurant name, the QR (rendered via `qr-code-styling` into a div ref), the caption, and the `tavli.ro` micro-credit. Two `size` variants: `"single"` (big, A4 portrait card) and `"tile"` (sticker-sheet cell).

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/menu-qr-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MenuQrCard } from "@/components/menu-qr-card";

// Auto-mock: jest replaces the module with a jest.fn() automatically.
// We then drive the constructor's behaviour per test via mockImplementation.
// Avoids the variable-hoist gotcha you'd hit with a factory function that
// closes over names not prefixed with `mock`.
jest.mock("qr-code-styling");

import QRCodeStyling from "qr-code-styling";
const MockedCtor = QRCodeStyling as unknown as jest.Mock;
const mockAppend = jest.fn();

beforeEach(() => {
  MockedCtor.mockReset();
  mockAppend.mockReset();
  MockedCtor.mockImplementation(() => ({ append: mockAppend }));
});

describe("MenuQrCard", () => {
  test("renders restaurant name, decorative mark, caption, and credit", () => {
    render(
      <MenuQrCard
        restaurantName="Trattoria Roma"
        menuUrl="https://tavli.ro/bucuresti/trattoria-roma/menu"
      />,
    );
    expect(screen.getByText("Trattoria Roma")).toBeInTheDocument();
    expect(screen.getByText("✦")).toBeInTheDocument();
    expect(screen.getByText(/scan to view our menu/i)).toBeInTheDocument();
    expect(screen.getByText("tavli.ro")).toBeInTheDocument();
  });

  test("instantiates QRCodeStyling with the encoded URL and Style-B config", () => {
    render(
      <MenuQrCard
        restaurantName="Trattoria Roma"
        menuUrl="https://tavli.ro/bucuresti/trattoria-roma/menu"
      />,
    );
    expect(MockedCtor).toHaveBeenCalledTimes(1);
    const opts = MockedCtor.mock.calls[0][0];
    expect(opts.data).toBe("https://tavli.ro/bucuresti/trattoria-roma/menu");
    expect(opts.dotsOptions).toEqual({ type: "dots", color: "#F97316" });
    expect(opts.cornersSquareOptions).toEqual({
      type: "extra-rounded",
      color: "#C2410C",
    });
    expect(opts.backgroundOptions).toEqual({ color: "#FEF0DC" });
    expect(opts.qrOptions).toEqual({ errorCorrectionLevel: "H" });
    expect(mockAppend).toHaveBeenCalledTimes(1);
  });

  test("size='single' uses the larger 280px QR", () => {
    render(
      <MenuQrCard
        restaurantName="Trattoria Roma"
        menuUrl="https://tavli.ro/bucuresti/trattoria-roma/menu"
        size="single"
      />,
    );
    const opts = MockedCtor.mock.calls[0][0];
    expect(opts.width).toBe(280);
    expect(opts.height).toBe(280);
    const root = screen.getByTestId("menu-qr-card");
    expect(root).toHaveAttribute("data-size", "single");
  });

  test("size='tile' uses the smaller 140px QR", () => {
    render(
      <MenuQrCard
        restaurantName="Trattoria Roma"
        menuUrl="https://tavli.ro/bucuresti/trattoria-roma/menu"
        size="tile"
      />,
    );
    const opts = MockedCtor.mock.calls[0][0];
    expect(opts.width).toBe(140);
    expect(opts.height).toBe(140);
    const root = screen.getByTestId("menu-qr-card");
    expect(root).toHaveAttribute("data-size", "tile");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx jest src/components/__tests__/menu-qr-card.test.tsx
```

Expected: FAIL with `Cannot find module '@/components/menu-qr-card'`.

- [ ] **Step 3: Implement the component**

Create `src/components/menu-qr-card.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import QRCodeStyling from "qr-code-styling";

interface MenuQrCardProps {
  restaurantName: string;
  menuUrl: string;
  size?: "single" | "tile";
}

const QR_PIXELS: Record<"single" | "tile", number> = {
  single: 280,
  tile: 140,
};

const STYLE_B_BASE = {
  type: "svg" as const,
  margin: 4,
  qrOptions: { errorCorrectionLevel: "H" as const },
  backgroundOptions: { color: "#FEF0DC" },
  dotsOptions: { type: "dots" as const, color: "#F97316" },
  cornersSquareOptions: {
    type: "extra-rounded" as const,
    color: "#C2410C",
  },
  cornersDotOptions: { type: "dot" as const, color: "#F97316" },
};

export function MenuQrCard({
  restaurantName,
  menuUrl,
  size = "single",
}: MenuQrCardProps) {
  const qrHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!qrHostRef.current) return;
    qrHostRef.current.innerHTML = "";
    const px = QR_PIXELS[size];
    const qr = new QRCodeStyling({
      ...STYLE_B_BASE,
      width: px,
      height: px,
      data: menuUrl,
    });
    qr.append(qrHostRef.current);
  }, [menuUrl, size]);

  const isSingle = size === "single";
  const cardSizing = isSingle
    ? "p-8 gap-3 max-w-[460px] aspect-[1/1.414] mx-auto"
    : "p-3 gap-1.5 aspect-square w-full";
  const nameSizing = isSingle ? "text-2xl" : "text-sm";
  const captionSizing = isSingle ? "text-base" : "text-[10px]";
  const creditSizing = isSingle ? "text-xs" : "text-[8px]";

  return (
    <div
      data-testid="menu-qr-card"
      data-size={size}
      className={`menu-qr-card relative flex flex-col items-center justify-between bg-gradient-to-b from-[#FFF7ED] to-[#FEF0DC] border-[1.5px] border-dashed border-[#FDBA74] rounded-[18px] ${cardSizing}`}
    >
      <span
        aria-hidden
        className={`text-[#C2410C] ${isSingle ? "text-2xl" : "text-base"} leading-none`}
      >
        ✦
      </span>
      <h2
        className={`font-display italic ${nameSizing} text-text-primary text-center leading-tight ${
          isSingle ? "font-bold" : "font-semibold"
        }`}
      >
        {restaurantName}
      </h2>
      <div ref={qrHostRef} data-testid="menu-qr-host" />
      <p
        className={`font-display italic ${captionSizing} text-text-secondary text-center`}
      >
        Scan to view our menu
      </p>
      <p className={`text-text-muted ${creditSizing}`}>tavli.ro</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx jest src/components/__tests__/menu-qr-card.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/menu-qr-card.tsx src/components/__tests__/menu-qr-card.test.tsx
git commit -m "feat(qr): MenuQrCard component with locked Style B config"
```

---

## Task 3: Diner page — `/<city>/<slug>/menu`

**Files:**
- Create: `src/app/[city]/[slug]/menu/page.tsx`
- Create: `src/app/[city]/[slug]/menu/__tests__/page.test.tsx`

Server component, Promise-based `params`. Awaits `getRestaurantDetail` + `getMenu` in parallel. Branches: missing → 404; menu empty → "Menu coming soon" placeholder; otherwise renders the existing `MenuViewer`. The Tavli wordmark at the top is *not* a link (display only). The footer microcopy `tavli.ro` *is* a link, but to `/<city>/<slug>` (this restaurant's discovery page), not the homepage.

- [ ] **Step 1: Write the failing test**

Create `src/app/[city]/[slug]/menu/__tests__/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import DinerMenuPage from "@/app/[city]/[slug]/menu/page";

const notFoundMock = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
jest.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

const getRestaurantDetailMock = jest.fn();
const getMenuMock = jest.fn();
jest.mock("@/lib/repos/restaurants-repo", () => ({
  getRestaurantDetail: (slug: string) => getRestaurantDetailMock(slug),
  getMenu: (slug: string) => getMenuMock(slug),
}));

jest.mock("@/components/menu-viewer", () => ({
  MenuViewer: ({ menu }: { menu: { items: Array<{ name: string }> } }) => (
    <div data-testid="menu-viewer">
      {menu.items.map((i) => (
        <span key={i.name}>{i.name}</span>
      ))}
    </div>
  ),
}));

const detailFixture = {
  id: "r1",
  slug: "trattoria-roma",
  name: "Trattoria Roma",
  cuisines: ["Italian"],
  priceLevel: 2 as const,
  zone: "Centro",
  city: "București",
  rating: 4.5,
  voteCount: 12,
  photoUrl: null,
  photoCount: 0,
  status: "open" as const,
  availableSlots: [],
  lat: null,
  lng: null,
  description: "",
  photos: [],
  schedule: [],
  address: "",
  tags: [],
  reviewIntelligence: null,
  reviews: [],
  nearby: [],
};

const menuFixtureWithItems = {
  restaurantId: "r1",
  currency: "lei" as const,
  sections: [{ id: "s1", name: "Pasta" }],
  items: [
    {
      id: "i1",
      sectionId: "s1",
      name: "Cacio e Pepe",
      description: "Pecorino, pepper, perfection",
      price: 42,
    },
  ],
};

const menuFixtureEmpty = {
  restaurantId: "r1",
  currency: "lei" as const,
  sections: [],
  items: [],
};

async function renderPage(citySlug = "bucuresti", slug = "trattoria-roma") {
  const Page = (await DinerMenuPage({
    params: Promise.resolve({ city: citySlug, slug }),
  })) as React.ReactElement;
  return render(Page);
}

describe("DinerMenuPage", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    getRestaurantDetailMock.mockReset();
    getMenuMock.mockReset();
  });

  test("happy path: renders restaurant name, MenuViewer, and footer link to discovery page", async () => {
    getRestaurantDetailMock.mockResolvedValue(detailFixture);
    getMenuMock.mockResolvedValue(menuFixtureWithItems);
    await renderPage();
    expect(screen.getByText("Trattoria Roma")).toBeInTheDocument();
    expect(screen.getByTestId("menu-viewer")).toBeInTheDocument();
    expect(screen.getByText("Cacio e Pepe")).toBeInTheDocument();
    const footerLink = screen.getByRole("link", { name: /tavli\.ro/i });
    expect(footerLink).toHaveAttribute("href", "/bucuresti/trattoria-roma");
  });

  test("empty menu: renders 'Menu coming soon' placeholder instead of MenuViewer", async () => {
    getRestaurantDetailMock.mockResolvedValue(detailFixture);
    getMenuMock.mockResolvedValue(menuFixtureEmpty);
    await renderPage();
    expect(screen.getByText("Trattoria Roma")).toBeInTheDocument();
    expect(screen.queryByTestId("menu-viewer")).toBeNull();
    expect(screen.getByText(/menu coming soon/i)).toBeInTheDocument();
  });

  test("missing restaurant: calls notFound()", async () => {
    getRestaurantDetailMock.mockResolvedValue(null);
    getMenuMock.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  test("Tavli wordmark at top is not a link", async () => {
    getRestaurantDetailMock.mockResolvedValue(detailFixture);
    getMenuMock.mockResolvedValue(menuFixtureWithItems);
    const { container } = await renderPage();
    const wordmark = container.querySelector('[data-testid="tavli-wordmark"]');
    expect(wordmark).not.toBeNull();
    expect(wordmark!.tagName).not.toBe("A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx jest 'src/app/\[city\]/\[slug\]/menu' --no-cache
```

Expected: FAIL with `Cannot find module '@/app/[city]/[slug]/menu/page'`.

- [ ] **Step 3: Implement the page**

Create `src/app/[city]/[slug]/menu/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMenu, getRestaurantDetail } from "@/lib/repos/restaurants-repo";
import { MenuViewer } from "@/components/menu-viewer";
import { formatCuisines, PRICE_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DinerMenuPage({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}) {
  const { city, slug } = await params;
  const [detail, menu] = await Promise.all([
    getRestaurantDetail(slug),
    getMenu(slug),
  ]);

  if (!detail) notFound();

  const hasMenu = !!menu && menu.sections.length > 0 && menu.items.length > 0;

  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <span
          data-testid="tavli-wordmark"
          className="font-display text-xl font-bold text-brand-primary tracking-tight"
        >
          Tavli
        </span>

        <header className="mt-8 text-center">
          <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
            {detail.name}
          </h1>
          <p className="text-sm text-text-muted mt-2">
            {formatCuisines(detail.cuisines)} · {PRICE_LABELS[detail.priceLevel]}
          </p>
        </header>

        <div className="mt-8">
          {hasMenu ? (
            <MenuViewer menu={menu!} />
          ) : (
            <div className="rounded-card border border-border bg-surface-white p-8 text-center">
              <p className="font-display text-xl font-bold text-text-primary">
                Menu coming soon
              </p>
              <p className="text-sm text-text-secondary mt-2">
                Please ask your server for a printed copy.
              </p>
            </div>
          )}
        </div>

        <footer className="mt-12 text-center text-xs text-text-muted">
          powered by{" "}
          <Link
            href={`/${city}/${slug}`}
            className="text-brand-primary hover:underline"
          >
            tavli.ro
          </Link>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx jest 'src/app/\[city\]/\[slug\]/menu'
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/\[city\]/\[slug\]/menu/page.tsx src/app/\[city\]/\[slug\]/menu/__tests__/page.test.tsx
git commit -m "feat(qr): diner-side /<city>/<slug>/menu minimal at-table view"
```

---

## Task 4: `MenuQrPreview` client component + print CSS

**Files:**
- Create: `src/app/partner/(dashboard)/menu/qr/MenuQrPreview.tsx`
- Create: `src/app/partner/(dashboard)/menu/qr/qr-print.css`
- Create: `src/app/partner/(dashboard)/menu/qr/__tests__/MenuQrPreview.test.tsx`

Owns the toggle between Single-card and Sticker-sheet modes, and the Print button. The print CSS handles A4 page sizing, quiet-zone margins, and hiding everything except the QR cards when printing.

- [ ] **Step 1: Write the failing test**

Create `src/app/partner/(dashboard)/menu/qr/__tests__/MenuQrPreview.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MenuQrPreview } from "@/app/partner/(dashboard)/menu/qr/MenuQrPreview";

jest.mock("qr-code-styling", () =>
  jest.fn().mockImplementation(() => ({ append: jest.fn() })),
);

describe("MenuQrPreview", () => {
  const props = {
    restaurant: {
      name: "Trattoria Roma",
      slug: "trattoria-roma",
      citySlug: "bucuresti",
    },
    menuUrl: "https://tavli.ro/bucuresti/trattoria-roma/menu",
  };

  test("defaults to single-card mode with one MenuQrCard", () => {
    render(<MenuQrPreview {...props} />);
    const cards = screen.getAllByTestId("menu-qr-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-size", "single");
  });

  test("toggling to sticker sheet renders 12 tile cards", () => {
    render(<MenuQrPreview {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /sticker sheet/i }));
    const cards = screen.getAllByTestId("menu-qr-card");
    expect(cards).toHaveLength(12);
    cards.forEach((card) => expect(card).toHaveAttribute("data-size", "tile"));
  });

  test("toggling back to single mode returns to one card", () => {
    render(<MenuQrPreview {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /sticker sheet/i }));
    fireEvent.click(screen.getByRole("radio", { name: /single card/i }));
    const cards = screen.getAllByTestId("menu-qr-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-size", "single");
  });

  test("Print button calls window.print()", () => {
    const printSpy = jest.spyOn(window, "print").mockImplementation(() => {});
    render(<MenuQrPreview {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^print$/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  test("each card receives the same restaurant name and menuUrl", () => {
    render(<MenuQrPreview {...props} />);
    expect(screen.getByText("Trattoria Roma")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx jest src/app/partner/\(dashboard\)/menu/qr
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/app/partner/(dashboard)/menu/qr/qr-print.css`:

```css
@media print {
  @page {
    size: A4 portrait;
    margin: 10mm;
  }

  body * {
    visibility: hidden;
  }
  .qr-print-area,
  .qr-print-area * {
    visibility: visible;
  }
  .qr-print-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }

  .menu-qr-card {
    break-inside: avoid;
  }
}
```

Create `src/app/partner/(dashboard)/menu/qr/MenuQrPreview.tsx`:

```tsx
"use client";

import { useState } from "react";
import { MenuQrCard } from "@/components/menu-qr-card";
import "./qr-print.css";

type LayoutMode = "single" | "sheet";

interface MenuQrPreviewProps {
  restaurant: {
    name: string;
    slug: string;
    citySlug: string;
  };
  menuUrl: string;
}

const TILE_COUNT = 12;

export function MenuQrPreview({ restaurant, menuUrl }: MenuQrPreviewProps) {
  const [mode, setMode] = useState<LayoutMode>("single");

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6 print:hidden">
        <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
          Print QR
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Stick the printed code on your tables. Diners scan it to see your
          menu — no booking, no friction.
        </p>
      </header>

      <fieldset
        role="radiogroup"
        aria-label="Layout"
        className="mb-6 flex gap-4 print:hidden"
      >
        <label className="cursor-pointer flex items-center gap-2">
          <input
            type="radio"
            name="qr-layout"
            value="single"
            checked={mode === "single"}
            onChange={() => setMode("single")}
            className="accent-brand-primary"
          />
          <span className="text-sm">Single card</span>
        </label>
        <label className="cursor-pointer flex items-center gap-2">
          <input
            type="radio"
            name="qr-layout"
            value="sheet"
            checked={mode === "sheet"}
            onChange={() => setMode("sheet")}
            className="accent-brand-primary"
          />
          <span className="text-sm">Sticker sheet (×12)</span>
        </label>
      </fieldset>

      <div className="qr-print-area">
        {mode === "single" ? (
          <MenuQrCard
            restaurantName={restaurant.name}
            menuUrl={menuUrl}
            size="single"
          />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: TILE_COUNT }, (_, i) => (
              <MenuQrCard
                key={i}
                restaurantName={restaurant.name}
                menuUrl={menuUrl}
                size="tile"
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-brand-primary text-white font-semibold py-3 px-6 rounded-lg hover:bg-brand-primary-dark"
        >
          Print
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx jest src/app/partner/\(dashboard\)/menu/qr
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/partner/\(dashboard\)/menu/qr/
git commit -m "feat(qr): MenuQrPreview client + print CSS (single/sheet toggle)"
```

---

## Task 5: Partner preview page — `/partner/menu/qr`

**Files:**
- Create: `src/app/partner/(dashboard)/menu/qr/page.tsx`

Server component. Loads the partner's restaurant via the same pattern as `src/app/partner/(dashboard)/menu/page.tsx`: read session, query `restaurants` by `owner_user_id`. Then resolves the city slug via the joined `cities` row, computes the `menuUrl` server-side using the existing `appOrigin()` pattern from the cron route, and renders `<MenuQrPreview>`.

- [ ] **Step 1: Implement the page**

Create `src/app/partner/(dashboard)/menu/qr/page.tsx`:

```tsx
import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { MenuQrPreview } from "./MenuQrPreview";

export const dynamic = "force-dynamic";

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}

export default async function PartnerMenuQrPage() {
  const session = await getCurrentSession();
  const supabase = await createSupabaseServerClient();

  const { data: row } = await supabase
    .from("restaurants")
    .select("id, slug, name, cities(slug)")
    .eq("owner_user_id", session!.userId)
    .maybeSingle();

  if (!row) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8">
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="font-semibold text-text-primary">
            No restaurant linked to this account.
          </p>
        </div>
      </div>
    );
  }

  const cityField = row.cities as { slug: string } | { slug: string }[] | null;
  const citySlug = Array.isArray(cityField)
    ? cityField[0]?.slug ?? ""
    : cityField?.slug ?? "";

  const menuUrl = `${appOrigin()}/${citySlug}/${row.slug}/menu`;

  return (
    <MenuQrPreview
      restaurant={{
        name: row.name,
        slug: row.slug,
        citySlug,
      }}
      menuUrl={menuUrl}
    />
  );
}
```

- [ ] **Step 2: Smoke-verify the page in dev**

Run:
```bash
npm run dev
```

Then in another terminal:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/partner/menu/qr
```

Note: this will redirect to sign-in if not authenticated (302 → /partner/sign-in) — that's correct behavior. The fact that the route exists and doesn't 404 / 500 is the assertion. If you can sign in as a partner locally, manually visit the URL and confirm the preview renders. If local Supabase is not configured, document this as deferred.

- [ ] **Step 3: Run all tests to confirm no regressions**

Run:
```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/partner/\(dashboard\)/menu/qr/page.tsx
git commit -m "feat(qr): /partner/menu/qr server page"
```

---

## Task 6: Gated "Print QR" button on `/partner/menu`

**Files:**
- Modify: `src/app/partner/(dashboard)/menu/page.tsx`
- Create: `src/app/partner/(dashboard)/menu/__tests__/page.test.tsx`

The button is a `<Link>` to `/partner/menu/qr` styled as a button. **Disabled** (rendered as a muted `<span>` with a tooltip) until at least one menu item exists. The data is already loaded by this page — `itemsRaw` from the existing query. We just check its length.

- [ ] **Step 1: Write the failing test**

Create `src/app/partner/(dashboard)/menu/__tests__/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { PrintQrButton } from "@/app/partner/(dashboard)/menu/PrintQrButton";

describe("PrintQrButton", () => {
  test("when menuItemCount is 0, renders disabled state with tooltip", () => {
    render(<PrintQrButton menuItemCount={0} />);
    const root = screen.getByTestId("print-qr-button");
    expect(root).toHaveAttribute("data-disabled", "true");
    expect(root.tagName).not.toBe("A");
    expect(root).toHaveAttribute(
      "title",
      "Add at least one menu item before printing",
    );
  });

  test("when menuItemCount is >= 1, renders an enabled link to /partner/menu/qr", () => {
    render(<PrintQrButton menuItemCount={1} />);
    const link = screen.getByRole("link", { name: /print qr/i });
    expect(link).toHaveAttribute("href", "/partner/menu/qr");
    expect(link).toHaveAttribute("data-disabled", "false");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx jest src/app/partner/\(dashboard\)/menu/__tests__/page.test.tsx
```

Expected: FAIL — `Cannot find module '.../PrintQrButton'`.

- [ ] **Step 3: Extract `PrintQrButton` as a tiny component for testability**

Create `src/app/partner/(dashboard)/menu/PrintQrButton.tsx`:

```tsx
import Link from "next/link";

interface Props {
  menuItemCount: number;
}

export function PrintQrButton({ menuItemCount }: Props) {
  const enabled = menuItemCount >= 1;
  const baseClasses =
    "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors";

  if (!enabled) {
    return (
      <span
        data-testid="print-qr-button"
        data-disabled="true"
        title="Add at least one menu item before printing"
        aria-disabled="true"
        className={`${baseClasses} border-border text-text-muted bg-surface-bg cursor-not-allowed`}
      >
        Print QR
      </span>
    );
  }

  return (
    <Link
      href="/partner/menu/qr"
      data-testid="print-qr-button"
      data-disabled="false"
      className={`${baseClasses} border-brand-primary text-brand-primary bg-surface-white hover:bg-brand-primary-soft`}
    >
      Print QR
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx jest src/app/partner/\(dashboard\)/menu/__tests__/page.test.tsx
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Wire it into the existing page**

Edit `src/app/partner/(dashboard)/menu/page.tsx`. Replace the existing `<header>` block:

```tsx
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Menu
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Sections, dishes, prices, dietary tags, chef&apos;s picks. Changes
          show on your public page immediately.
        </p>
      </header>
```

with:

```tsx
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
            Menu
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Sections, dishes, prices, dietary tags, chef&apos;s picks. Changes
            show on your public page immediately.
          </p>
        </div>
        <PrintQrButton menuItemCount={(itemsRaw ?? []).length} />
      </header>
```

And add the import at the top of the file (alongside the existing imports):

```tsx
import { PrintQrButton } from "./PrintQrButton";
```

- [ ] **Step 6: Run all tests to verify no regressions**

Run:
```bash
npm test
```

Expected: all tests pass — including any existing tests for the partner menu page if such tests exist.

- [ ] **Step 7: Commit**

```bash
git add src/app/partner/\(dashboard\)/menu/page.tsx src/app/partner/\(dashboard\)/menu/PrintQrButton.tsx src/app/partner/\(dashboard\)/menu/__tests__/page.test.tsx
git commit -m "feat(qr): gated 'Print QR' button on /partner/menu"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Plan task |
|---|---|
| Diner page route, structure, force-dynamic, noindex | Task 3 |
| Tavli wordmark non-clickable | Task 3 (test 4 verifies tag != A) |
| Footer link to discovery page (not /) | Task 3 (test 1 verifies href) |
| Empty-menu graceful state | Task 3 (test 2) |
| 404 for missing slug | Task 3 (test 3) |
| Partner /partner/menu/qr route | Task 5 |
| MenuQrPreview client component | Task 4 |
| Single-card / sticker-sheet toggle | Task 4 |
| 12 tiles in sheet | Task 4 (test asserts length 12) |
| Print button → window.print() | Task 4 |
| @media print + @page A4 | Task 4 (qr-print.css) |
| MenuQrCard with locked Style B | Task 2 |
| Two size variants (single 280, tile 140) | Task 2 (tests verify both) |
| Gated Print QR button on /partner/menu | Task 6 |
| Disabled when menuItemCount < 1 | Task 6 (test 1) |
| Linked to /partner/menu/qr when enabled | Task 6 (test 2) |
| qr-code-styling library | Task 1 |
| No DB / migrations / env / RLS changes | All tasks (none introduce these) |

All spec requirements are mapped to a task. Smoke-test plan from the spec lives in the spec doc and is executed manually post-merge — not encoded as a task here (the spec explicitly calls it out as manual).

**2. Placeholder scan:** No "TBD", "TODO", or "implement later" patterns in the plan. All steps include either exact commands or full code blocks.

**3. Type consistency:**
- `MenuQrCard` props: `{ restaurantName: string; menuUrl: string; size?: "single" | "tile" }` — used identically in Task 2 (definition), Task 4 (MenuQrPreview consumes it).
- `MenuQrPreview` props: `{ restaurant: { name; slug; citySlug }; menuUrl: string }` — defined Task 4, consumed Task 5.
- `PrintQrButton` props: `{ menuItemCount: number }` — defined Task 6, consumed Task 6.
- `appOrigin()` helper: locally defined in Task 5 (mirrors the cron route's pattern) — not imported from elsewhere because the cron route doesn't export it.

All consistent. No drift.
