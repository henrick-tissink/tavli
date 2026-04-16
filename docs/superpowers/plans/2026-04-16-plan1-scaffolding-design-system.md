# Plan 1: Project Scaffolding + Design System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Next.js project with TypeScript, Tailwind, and a complete design system of reusable primitives — tokens, Card B, pills, buttons, avatars, rating/status badges, time slot pills, bottom sheet — so all subsequent plans can build on a solid foundation.

**Architecture:** Next.js 15 App Router with TypeScript. Tailwind CSS v4 for styling with custom design tokens. Component library built as plain React components in `src/components/`. No external UI library — we own every pixel. Mobile-first responsive design with breakpoints at 768px and 1024px.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Lucide Icons, next/font (Inter)

**Spec reference:** `docs/superpowers/specs/2026-04-16-ui-ux-design.md` — Sections 1 (Design System), 2 (Navigation), 4 (Card B)

---

### Task 1: Initialize Next.js Project + Git

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Initialize the project**

```bash
cd /Users/henricktissink/Sauce/masaro
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

When prompted, accept defaults. This creates the Next.js 15 project with TypeScript and Tailwind in the current directory.

- [ ] **Step 2: Initialize git repository**

```bash
git init
echo ".superpowers/" >> .gitignore
echo "ialoc-*.png" >> .gitignore
git add -A
git commit -m "chore: initialize Next.js 15 project with TypeScript and Tailwind"
```

- [ ] **Step 3: Install additional dependencies**

```bash
npm install lucide-react
npm install -D @testing-library/react @testing-library/jest-dom jest jest-environment-jsdom @types/jest ts-jest
```

- [ ] **Step 4: Create Jest configuration**

Create `jest.config.ts`:

```typescript
import type { Config } from "jest";
import nextJest from "next/jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterSetup: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default createJestConfig(config);
```

Create `jest.setup.ts`:

```typescript
import "@testing-library/jest-dom";
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  }
}
```

- [ ] **Step 5: Verify setup works**

Run: `npm run dev`
Expected: Dev server starts at localhost:3000 with default Next.js page.

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add jest, testing-library, lucide-react"
```

---

### Task 2: Design Tokens + Tailwind Configuration

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Create: `src/lib/tokens.ts`

- [ ] **Step 1: Write the token test**

Create `src/lib/__tests__/tokens.test.ts`:

```typescript
import { colors, spacing, radii, shadows, breakpoints, typography } from "@/lib/tokens";

describe("Design Tokens", () => {
  test("colors has all required tokens", () => {
    expect(colors.brandPrimary).toBe("#F97316");
    expect(colors.brandPrimarySoft).toBe("#FFF7ED");
    expect(colors.brandPrimaryDark).toBe("#EA580C");
    expect(colors.surfaceWhite).toBe("#FFFFFF");
    expect(colors.surfaceBg).toBe("#FAFAF9");
    expect(colors.surfaceWarm).toBe("#FEF3C7");
    expect(colors.textPrimary).toBe("#1C1917");
    expect(colors.textSecondary).toBe("#78716C");
    expect(colors.textMuted).toBe("#A8A29E");
    expect(colors.border).toBe("#E7E5E4");
    expect(colors.success).toBe("#16A34A");
    expect(colors.error).toBe("#DC2626");
    expect(colors.info).toBe("#0EA5E9");
  });

  test("spacing base unit is 4", () => {
    expect(spacing.base).toBe(4);
    expect(spacing[1]).toBe("4px");
    expect(spacing[2]).toBe("8px");
    expect(spacing[4]).toBe("16px");
  });

  test("radii match spec", () => {
    expect(radii.card).toBe("16px");
    expect(radii.button).toBe("10px");
    expect(radii.avatar).toBe("50%");
  });

  test("breakpoints match spec", () => {
    expect(breakpoints.tablet).toBe(768);
    expect(breakpoints.desktop).toBe(1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/tokens.test.ts --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement design tokens**

Create `src/lib/tokens.ts`:

```typescript
export const colors = {
  brandPrimary: "#F97316",
  brandPrimarySoft: "#FFF7ED",
  brandPrimaryDark: "#EA580C",
  surfaceWhite: "#FFFFFF",
  surfaceBg: "#FAFAF9",
  surfaceWarm: "#FEF3C7",
  textPrimary: "#1C1917",
  textSecondary: "#78716C",
  textMuted: "#A8A29E",
  border: "#E7E5E4",
  success: "#16A34A",
  error: "#DC2626",
  info: "#0EA5E9",
} as const;

export const spacing = {
  base: 4,
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
} as const;

export const radii = {
  card: "16px",
  button: "10px",
  avatar: "50%",
  pill: "20px",
} as const;

export const shadows = {
  card: "0 2px 8px rgba(0,0,0,0.06)",
  cardHover: "0 4px 16px rgba(0,0,0,0.1)",
  modal: "0 -4px 24px rgba(0,0,0,0.12)",
  floating: "0 4px 20px rgba(0,0,0,0.15)",
} as const;

export const breakpoints = {
  tablet: 768,
  desktop: 1024,
} as const;

export const typography = {
  pageTitle: { weight: 800, sizeMobile: "28px", sizeDesktop: "36px" },
  sectionHeading: { weight: 700, sizeMobile: "20px", sizeDesktop: "24px" },
  cardTitle: { weight: 700, sizeMobile: "17px", sizeDesktop: "18px" },
  body: { weight: 400, sizeMobile: "14px", sizeDesktop: "15px" },
  small: { weight: 500, sizeMobile: "12px", sizeDesktop: "13px" },
  pill: { weight: 600, sizeMobile: "12px", sizeDesktop: "13px" },
  button: { weight: 700, sizeMobile: "14px", sizeDesktop: "15px" },
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/tokens.test.ts --verbose`
Expected: PASS — all assertions green

- [ ] **Step 5: Configure Tailwind with custom tokens**

Replace `tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#F97316",
          "primary-soft": "#FFF7ED",
          "primary-dark": "#EA580C",
        },
        surface: {
          white: "#FFFFFF",
          bg: "#FAFAF9",
          warm: "#FEF3C7",
        },
        text: {
          primary: "#1C1917",
          secondary: "#78716C",
          muted: "#A8A29E",
        },
        border: "#E7E5E4",
        success: "#16A34A",
        error: "#DC2626",
        info: "#0EA5E9",
      },
      borderRadius: {
        card: "16px",
        button: "10px",
        pill: "20px",
      },
      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.06)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.1)",
        modal: "0 -4px 24px rgba(0,0,0,0.12)",
        floating: "0 4px 20px rgba(0,0,0,0.15)",
      },
      maxWidth: {
        content: "1280px",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      screens: {
        tablet: "768px",
        desktop: "1024px",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Set up global CSS and Inter font**

Replace `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-surface-bg text-text-primary antialiased;
  }
}
```

Replace `src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Tavli — Find Your Table",
  description: "Discover and book restaurants in Romania and Turkey",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Verify Tailwind tokens work**

Replace `src/app/page.tsx`:

```typescript
export default function Home() {
  return (
    <div className="min-h-screen bg-surface-bg p-6">
      <h1 className="text-3xl font-extrabold text-text-primary">Tavli</h1>
      <p className="mt-2 text-text-secondary">Find your table.</p>
      <button className="mt-4 rounded-button bg-brand-primary px-6 py-3 font-bold text-white shadow-card hover:bg-brand-primary-dark hover:shadow-card-hover transition-all">
        Book a Table
      </button>
    </div>
  );
}
```

Run: `npm run dev`
Expected: Page shows "Tavli" heading in dark text on warm white bg, orange button with rounded corners and shadow.

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add design tokens and Tailwind configuration"
```

---

### Task 3: Button Component

**Files:**
- Create: `src/components/button.tsx`
- Create: `src/components/__tests__/button.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/button.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/button";

describe("Button", () => {
  test("renders with label", () => {
    render(<Button>Book a Table</Button>);
    expect(screen.getByRole("button", { name: "Book a Table" })).toBeInTheDocument();
  });

  test("renders primary variant by default", () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-brand-primary");
  });

  test("renders secondary variant", () => {
    render(<Button variant="secondary">Click</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-brand-primary-soft");
  });

  test("renders full-width when fullWidth is true", () => {
    render(<Button fullWidth>Click</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("w-full");
  });

  test("is disabled when disabled prop is true", () => {
    render(<Button disabled>Click</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  test("calls onClick handler", async () => {
    const handler = jest.fn();
    render(<Button onClick={handler}>Click</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/button.test.tsx --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Install user-event**

```bash
npm install -D @testing-library/user-event
```

- [ ] **Step 4: Implement Button component**

Create `src/components/button.tsx`:

```typescript
import { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-primary text-white hover:bg-brand-primary-dark active:scale-[0.98]",
  secondary:
    "bg-brand-primary-soft text-brand-primary-dark hover:bg-orange-100 active:scale-[0.98]",
  ghost:
    "bg-transparent text-text-secondary hover:bg-surface-bg active:scale-[0.98]",
};

export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center
        rounded-button px-6 py-3
        font-bold text-sm
        shadow-card
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${variantStyles[variant]}
        ${fullWidth ? "w-full" : ""}
        ${className}
      `.trim()}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/components/__tests__/button.test.tsx --verbose`
Expected: PASS — all 6 tests green

- [ ] **Step 6: Commit**

```bash
git add src/components/button.tsx src/components/__tests__/button.test.tsx
git commit -m "feat: add Button component with primary/secondary/ghost variants"
```

---

### Task 4: Pill Component

**Files:**
- Create: `src/components/pill.tsx`
- Create: `src/components/__tests__/pill.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/pill.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pill } from "@/components/pill";

describe("Pill", () => {
  test("renders with label", () => {
    render(<Pill label="Open Now" />);
    expect(screen.getByText("Open Now")).toBeInTheDocument();
  });

  test("renders inactive by default", () => {
    render(<Pill label="Italian" />);
    const pill = screen.getByText("Italian").closest("button")!;
    expect(pill.className).toContain("bg-surface-bg");
  });

  test("renders active state", () => {
    render(<Pill label="Italian" active />);
    const pill = screen.getByText("Italian").closest("button")!;
    expect(pill.className).toContain("bg-brand-primary");
  });

  test("shows count when provided", () => {
    render(<Pill label="Italian" count={153} />);
    expect(screen.getByText("153")).toBeInTheDocument();
  });

  test("shows icon when provided", () => {
    render(<Pill label="Brunch" icon="🥂" />);
    expect(screen.getByText("🥂")).toBeInTheDocument();
  });

  test("shows close button when dismissible", () => {
    render(<Pill label="Italian" active dismissible />);
    expect(screen.getByLabelText("Remove Italian filter")).toBeInTheDocument();
  });

  test("calls onToggle when clicked", async () => {
    const handler = jest.fn();
    render(<Pill label="Italian" onToggle={handler} />);
    await userEvent.click(screen.getByText("Italian").closest("button")!);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("shows dropdown indicator when hasDropdown", () => {
    render(<Pill label="Cuisine" hasDropdown />);
    expect(screen.getByText("▾")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/pill.test.tsx --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Pill component**

Create `src/components/pill.tsx`:

```typescript
interface PillProps {
  label: string;
  active?: boolean;
  icon?: string;
  count?: number;
  dismissible?: boolean;
  hasDropdown?: boolean;
  onToggle?: () => void;
  onDismiss?: () => void;
}

export function Pill({
  label,
  active = false,
  icon,
  count,
  dismissible = false,
  hasDropdown = false,
  onToggle,
  onDismiss,
}: PillProps) {
  return (
    <button
      onClick={onToggle}
      className={`
        inline-flex items-center gap-1.5
        rounded-pill px-3 py-1.5
        text-xs font-semibold
        transition-colors duration-150
        whitespace-nowrap
        ${
          active
            ? "bg-brand-primary text-white"
            : "bg-surface-bg text-text-secondary hover:bg-gray-100"
        }
      `}
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={`text-[10px] ${active ? "text-orange-200" : "text-text-muted"}`}
        >
          {count}
        </span>
      )}
      {hasDropdown && <span className="text-[10px]">▾</span>}
      {dismissible && active && (
        <span
          role="button"
          aria-label={`Remove ${label} filter`}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss?.();
          }}
          className="ml-0.5 text-[10px] hover:text-white/80"
        >
          ×
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/__tests__/pill.test.tsx --verbose`
Expected: PASS — all 8 tests green

- [ ] **Step 5: Commit**

```bash
git add src/components/pill.tsx src/components/__tests__/pill.test.tsx
git commit -m "feat: add Pill component with active/inactive, count, icon, dropdown states"
```

---

### Task 5: Avatar Component

**Files:**
- Create: `src/components/avatar.tsx`
- Create: `src/components/__tests__/avatar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/avatar.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { Avatar } from "@/components/avatar";

describe("Avatar", () => {
  test("renders initials from name", () => {
    render(<Avatar name="Nicoleta" />);
    expect(screen.getByText("N")).toBeInTheDocument();
  });

  test("generates deterministic color from name", () => {
    const { container: c1 } = render(<Avatar name="Nicoleta" />);
    const { container: c2 } = render(<Avatar name="Nicoleta" />);
    const style1 = c1.firstElementChild!.getAttribute("style");
    const style2 = c2.firstElementChild!.getAttribute("style");
    expect(style1).toBe(style2);
  });

  test("different names get different colors", () => {
    const { container: c1 } = render(<Avatar name="Anca" />);
    const { container: c2 } = render(<Avatar name="Bogdan" />);
    const style1 = c1.firstElementChild!.getAttribute("style");
    const style2 = c2.firstElementChild!.getAttribute("style");
    expect(style1).not.toBe(style2);
  });

  test("renders at default size", () => {
    const { container } = render(<Avatar name="Test" />);
    expect(container.firstElementChild!.className).toContain("w-10");
  });

  test("renders at small size", () => {
    const { container } = render(<Avatar name="Test" size="sm" />);
    expect(container.firstElementChild!.className).toContain("w-7");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/avatar.test.tsx --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Avatar component**

Create `src/components/avatar.tsx`:

```typescript
const AVATAR_COLORS = [
  "#F97316", // orange
  "#8B5CF6", // purple
  "#0EA5E9", // sky
  "#10B981", // emerald
  "#E11D48", // rose
  "#D97706", // amber
  "#6366F1", // indigo
  "#14B8A6", // teal
  "#EC4899", // pink
  "#7C3AED", // violet
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getColor(name: string): string {
  return AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
}

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "w-7 h-7 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-lg",
};

export function Avatar({ name, size = "md" }: AvatarProps) {
  const initial = name.charAt(0).toUpperCase();
  const color = getColor(name);

  return (
    <div
      className={`
        inline-flex items-center justify-center
        rounded-full font-bold text-white
        ${sizeClasses[size]}
      `}
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/__tests__/avatar.test.tsx --verbose`
Expected: PASS — all 5 tests green

- [ ] **Step 5: Commit**

```bash
git add src/components/avatar.tsx src/components/__tests__/avatar.test.tsx
git commit -m "feat: add Avatar component with deterministic color from name"
```

---

### Task 6: Rating Badge Component

**Files:**
- Create: `src/components/rating-badge.tsx`
- Create: `src/components/__tests__/rating-badge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/rating-badge.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { RatingBadge } from "@/components/rating-badge";

describe("RatingBadge", () => {
  test("renders rating value", () => {
    render(<RatingBadge rating={4.8} />);
    expect(screen.getByText("4.8")).toBeInTheDocument();
  });

  test("renders with star icon", () => {
    render(<RatingBadge rating={4.8} />);
    expect(screen.getByText("★")).toBeInTheDocument();
  });

  test("renders inline variant", () => {
    const { container } = render(<RatingBadge rating={4.8} variant="inline" />);
    expect(container.firstElementChild!.className).toContain("bg-brand-primary-soft");
  });

  test("renders overlay variant", () => {
    const { container } = render(<RatingBadge rating={4.8} variant="overlay" />);
    expect(container.firstElementChild!.className).toContain("backdrop-blur");
  });

  test("renders vote count when provided", () => {
    render(<RatingBadge rating={4.8} voteCount={9549} />);
    expect(screen.getByText("(9.549)")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/rating-badge.test.tsx --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RatingBadge component**

Create `src/components/rating-badge.tsx`:

```typescript
interface RatingBadgeProps {
  rating: number;
  voteCount?: number;
  variant?: "inline" | "overlay";
}

function formatCount(n: number): string {
  return n.toLocaleString("ro-RO");
}

export function RatingBadge({
  rating,
  voteCount,
  variant = "inline",
}: RatingBadgeProps) {
  const baseClasses = "inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-sm";
  const variantClasses =
    variant === "overlay"
      ? "bg-black/45 backdrop-blur-sm text-white"
      : "bg-brand-primary-soft text-brand-primary-dark";

  return (
    <span className={`${baseClasses} ${variantClasses}`}>
      <span>{rating.toFixed(1)}</span>
      <span className="text-xs">★</span>
      {voteCount !== undefined && (
        <span className="text-xs font-medium opacity-75">
          ({formatCount(voteCount)})
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/__tests__/rating-badge.test.tsx --verbose`
Expected: PASS — all 5 tests green

- [ ] **Step 5: Commit**

```bash
git add src/components/rating-badge.tsx src/components/__tests__/rating-badge.test.tsx
git commit -m "feat: add RatingBadge component with inline/overlay variants"
```

---

### Task 7: StatusBadge Component

**Files:**
- Create: `src/components/status-badge.tsx`
- Create: `src/components/__tests__/status-badge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/status-badge.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/status-badge";

describe("StatusBadge", () => {
  test("renders 'Open now' for open status", () => {
    render(<StatusBadge status="open" closesAt="23:00" />);
    expect(screen.getByText("Open now")).toBeInTheDocument();
  });

  test("renders closing time for open status", () => {
    render(<StatusBadge status="open" closesAt="23:00" />);
    expect(screen.getByText(/23:00/)).toBeInTheDocument();
  });

  test("renders 'Closed' for closed status", () => {
    render(<StatusBadge status="closed" opensAt="11:30" />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  test("uses green color for open", () => {
    const { container } = render(<StatusBadge status="open" />);
    expect(container.firstElementChild!.className).toContain("text-success");
  });

  test("uses red color for closed", () => {
    const { container } = render(<StatusBadge status="closed" />);
    expect(container.firstElementChild!.className).toContain("text-error");
  });

  test("renders compact variant without closing time", () => {
    render(<StatusBadge status="open" closesAt="23:00" variant="compact" />);
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.queryByText(/23:00/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/status-badge.test.tsx --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement StatusBadge component**

Create `src/components/status-badge.tsx`:

```typescript
interface StatusBadgeProps {
  status: "open" | "closed";
  closesAt?: string;
  opensAt?: string;
  variant?: "full" | "compact";
}

export function StatusBadge({
  status,
  closesAt,
  opensAt,
  variant = "full",
}: StatusBadgeProps) {
  const isOpen = status === "open";

  if (variant === "compact") {
    return (
      <span
        className={`
          inline-flex items-center gap-1 rounded-pill px-2 py-0.5
          text-xs font-semibold
          ${isOpen ? "bg-green-50 text-success" : "bg-red-50 text-error"}
        `}
      >
        <span className="text-[8px]">●</span>
        {isOpen ? "Open" : "Closed"}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-sm ${isOpen ? "text-success" : "text-error"}`}>
      <span className="text-[8px]">●</span>
      {isOpen ? "Open" : "Closed"}
      {isOpen && closesAt && (
        <span className="text-text-muted"> · Closes at {closesAt}</span>
      )}
      {!isOpen && opensAt && (
        <span className="text-text-muted"> · Opens at {opensAt}</span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/__tests__/status-badge.test.tsx --verbose`
Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add src/components/status-badge.tsx src/components/__tests__/status-badge.test.tsx
git commit -m "feat: add StatusBadge component for open/closed venue status"
```

---

### Task 8: TimeSlotPills Component

**Files:**
- Create: `src/components/time-slot-pills.tsx`
- Create: `src/components/__tests__/time-slot-pills.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/time-slot-pills.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeSlotPills } from "@/components/time-slot-pills";

const slots = ["7:00", "7:30", "8:00", "8:30", "9:00"];

describe("TimeSlotPills", () => {
  test("renders time slots", () => {
    render(<TimeSlotPills slots={slots} />);
    expect(screen.getByText("7:00")).toBeInTheDocument();
    expect(screen.getByText("8:00")).toBeInTheDocument();
  });

  test("limits visible slots to maxVisible", () => {
    render(<TimeSlotPills slots={slots} maxVisible={3} />);
    expect(screen.getByText("7:00")).toBeInTheDocument();
    expect(screen.getByText("7:30")).toBeInTheDocument();
    expect(screen.getByText("8:00")).toBeInTheDocument();
    expect(screen.queryByText("8:30")).toBeNull();
    expect(screen.getByText("More →")).toBeInTheDocument();
  });

  test("highlights selected slot", () => {
    render(<TimeSlotPills slots={slots} selected="8:00" />);
    const selectedPill = screen.getByText("8:00").closest("button")!;
    expect(selectedPill.className).toContain("bg-brand-primary");
  });

  test("calls onSelect when slot clicked", async () => {
    const handler = jest.fn();
    render(<TimeSlotPills slots={slots} onSelect={handler} />);
    await userEvent.click(screen.getByText("7:30"));
    expect(handler).toHaveBeenCalledWith("7:30");
  });

  test("renders empty state when no slots", () => {
    render(<TimeSlotPills slots={[]} />);
    expect(screen.getByText("No tables tonight")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/time-slot-pills.test.tsx --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TimeSlotPills component**

Create `src/components/time-slot-pills.tsx`:

```typescript
interface TimeSlotPillsProps {
  slots: string[];
  selected?: string;
  maxVisible?: number;
  onSelect?: (slot: string) => void;
  onMore?: () => void;
}

export function TimeSlotPills({
  slots,
  selected,
  maxVisible = 4,
  onSelect,
  onMore,
}: TimeSlotPillsProps) {
  if (slots.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No tables tonight ·{" "}
        <button onClick={onMore} className="text-brand-primary font-semibold">
          Try another date
        </button>
      </p>
    );
  }

  const visible = slots.slice(0, maxVisible);
  const hasMore = slots.length > maxVisible;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((slot) => (
        <button
          key={slot}
          onClick={() => onSelect?.(slot)}
          className={`
            rounded-lg px-3 py-1.5
            text-xs font-semibold
            transition-colors duration-150
            ${
              selected === slot
                ? "bg-brand-primary text-white"
                : "bg-brand-primary-soft text-brand-primary-dark hover:bg-orange-100"
            }
          `}
        >
          {slot}
        </button>
      ))}
      {hasMore && (
        <button
          onClick={onMore}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-gray-200"
        >
          More →
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/__tests__/time-slot-pills.test.tsx --verbose`
Expected: PASS — all 5 tests green

- [ ] **Step 5: Commit**

```bash
git add src/components/time-slot-pills.tsx src/components/__tests__/time-slot-pills.test.tsx
git commit -m "feat: add TimeSlotPills component with selection, max visible, empty state"
```

---

### Task 9: BottomSheet Component

**Files:**
- Create: `src/components/bottom-sheet.tsx`
- Create: `src/components/__tests__/bottom-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/bottom-sheet.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomSheet } from "@/components/bottom-sheet";

describe("BottomSheet", () => {
  test("renders children when open", () => {
    render(
      <BottomSheet open onClose={() => {}}>
        <p>Sheet content</p>
      </BottomSheet>
    );
    expect(screen.getByText("Sheet content")).toBeInTheDocument();
  });

  test("does not render when closed", () => {
    render(
      <BottomSheet open={false} onClose={() => {}}>
        <p>Sheet content</p>
      </BottomSheet>
    );
    expect(screen.queryByText("Sheet content")).toBeNull();
  });

  test("renders title when provided", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Book a Table">
        <p>Content</p>
      </BottomSheet>
    );
    expect(screen.getByText("Book a Table")).toBeInTheDocument();
  });

  test("renders close button", () => {
    render(
      <BottomSheet open onClose={() => {}}>
        <p>Content</p>
      </BottomSheet>
    );
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  test("calls onClose when close button clicked", async () => {
    const handler = jest.fn();
    render(
      <BottomSheet open onClose={handler}>
        <p>Content</p>
      </BottomSheet>
    );
    await userEvent.click(screen.getByLabelText("Close"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("calls onClose when backdrop clicked", async () => {
    const handler = jest.fn();
    render(
      <BottomSheet open onClose={handler}>
        <p>Content</p>
      </BottomSheet>
    );
    await userEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/bottom-sheet.test.tsx --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement BottomSheet component**

Create `src/components/bottom-sheet.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        data-testid="sheet-backdrop"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet — bottom on mobile, centered modal on desktop */}
      <div
        className="
          absolute bottom-0 left-0 right-0
          max-h-[85vh] overflow-y-auto
          rounded-t-2xl bg-surface-white shadow-modal
          desktop:bottom-auto desktop:left-1/2 desktop:top-1/2
          desktop:-translate-x-1/2 desktop:-translate-y-1/2
          desktop:w-[520px] desktop:rounded-2xl desktop:max-h-[80vh]
        "
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 desktop:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          {title && (
            <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-full p-1.5 text-text-muted hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/__tests__/bottom-sheet.test.tsx --verbose`
Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add src/components/bottom-sheet.tsx src/components/__tests__/bottom-sheet.test.tsx
git commit -m "feat: add BottomSheet component with backdrop, close, escape key"
```

---

### Task 10: Card B — Restaurant Card Component

**Files:**
- Create: `src/components/restaurant-card.tsx`
- Create: `src/lib/types.ts`
- Create: `src/components/__tests__/restaurant-card.test.tsx`

- [ ] **Step 1: Create shared types**

Create `src/lib/types.ts`:

```typescript
export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  cuisine: string;
  priceLevel: 1 | 2 | 3 | 4;
  zone: string;
  city: string;
  rating: number;
  voteCount: number;
  photoUrl: string | null;
  photoCount: number;
  status: "open" | "closed";
  closesAt?: string;
  opensAt?: string;
  availableSlots: string[];
  reviewSnippet?: string;
  topDimensionLabel?: string;
  topDimensionPercent?: number;
  distance?: string;
}

export const PRICE_LABELS: Record<number, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};
```

- [ ] **Step 2: Write the failing test**

Create `src/components/__tests__/restaurant-card.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { RestaurantCard } from "@/components/restaurant-card";
import type { Restaurant } from "@/lib/types";

const mockRestaurant: Restaurant = {
  id: "1",
  slug: "papila-rezervari-2990",
  name: "Papila",
  cuisine: "Contemporary French",
  priceLevel: 2,
  zone: "Centrul Vechi",
  city: "bucuresti",
  rating: 4.8,
  voteCount: 2968,
  photoUrl: "/test-photo.jpg",
  photoCount: 42,
  status: "open",
  closesAt: "23:00",
  availableSlots: ["7:00", "7:30", "8:00", "8:30", "9:00"],
  reviewSnippet: "Best carbonara in Bucharest",
  topDimensionLabel: "atmosphere",
  topDimensionPercent: 95,
};

describe("RestaurantCard", () => {
  test("renders restaurant name", () => {
    render(<RestaurantCard restaurant={mockRestaurant} />);
    expect(screen.getByText("Papila")).toBeInTheDocument();
  });

  test("renders cuisine, price, and zone", () => {
    render(<RestaurantCard restaurant={mockRestaurant} />);
    expect(screen.getByText(/Contemporary French/)).toBeInTheDocument();
    expect(screen.getByText(/\$\$/)).toBeInTheDocument();
    expect(screen.getByText(/Centrul Vechi/)).toBeInTheDocument();
  });

  test("renders rating badge", () => {
    render(<RestaurantCard restaurant={mockRestaurant} />);
    expect(screen.getByText("4.8")).toBeInTheDocument();
  });

  test("renders open status badge", () => {
    render(<RestaurantCard restaurant={mockRestaurant} />);
    expect(screen.getByText("Open now")).toBeInTheDocument();
  });

  test("renders time slots limited to 4", () => {
    render(<RestaurantCard restaurant={mockRestaurant} />);
    expect(screen.getByText("7:00")).toBeInTheDocument();
    expect(screen.getByText("8:00")).toBeInTheDocument();
    expect(screen.getByText("More →")).toBeInTheDocument();
  });

  test("renders review snippet", () => {
    render(<RestaurantCard restaurant={mockRestaurant} />);
    expect(screen.getByText(/Best carbonara in Bucharest/)).toBeInTheDocument();
    expect(screen.getByText(/95%/)).toBeInTheDocument();
  });

  test("renders photo count", () => {
    render(<RestaurantCard restaurant={mockRestaurant} />);
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  test("renders fallback when no photo", () => {
    const noPhoto = { ...mockRestaurant, photoUrl: null };
    render(<RestaurantCard restaurant={noPhoto} />);
    expect(screen.getByText("Papila")).toBeInTheDocument();
  });

  test("renders closed state with dimmed photo", () => {
    const closed = { ...mockRestaurant, status: "closed" as const };
    render(<RestaurantCard restaurant={closed} />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  test("renders save button", () => {
    render(<RestaurantCard restaurant={mockRestaurant} />);
    expect(screen.getByLabelText("Save Papila")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/components/__tests__/restaurant-card.test.tsx --verbose`
Expected: FAIL — module not found

- [ ] **Step 4: Implement RestaurantCard component**

Create `src/components/restaurant-card.tsx`:

```typescript
"use client";

import { Heart } from "lucide-react";
import { RatingBadge } from "@/components/rating-badge";
import { StatusBadge } from "@/components/status-badge";
import { TimeSlotPills } from "@/components/time-slot-pills";
import type { Restaurant } from "@/lib/types";
import { PRICE_LABELS } from "@/lib/types";

interface RestaurantCardProps {
  restaurant: Restaurant;
  saved?: boolean;
  onSave?: (id: string) => void;
  onSlotSelect?: (restaurantId: string, slot: string) => void;
  onClick?: (restaurant: Restaurant) => void;
}

export function RestaurantCard({
  restaurant,
  saved = false,
  onSave,
  onSlotSelect,
  onClick,
}: RestaurantCardProps) {
  const {
    id,
    name,
    cuisine,
    priceLevel,
    zone,
    rating,
    photoUrl,
    photoCount,
    status,
    closesAt,
    opensAt,
    availableSlots,
    reviewSnippet,
    topDimensionLabel,
    topDimensionPercent,
  } = restaurant;

  const isClosed = status === "closed";

  return (
    <article
      onClick={() => onClick?.(restaurant)}
      className="
        cursor-pointer overflow-hidden rounded-card
        bg-surface-white shadow-card
        transition-all duration-200
        hover:shadow-card-hover hover:-translate-y-0.5
        active:scale-[0.98]
      "
    >
      {/* Photo Section — 55% */}
      <div className={`relative aspect-[16/10] ${isClosed ? "opacity-60" : ""}`}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-primary/20 to-brand-primary/40">
            <span className="text-2xl font-extrabold text-brand-primary-dark/60">
              {name}
            </span>
          </div>
        )}

        {/* Top-left badges */}
        <div className="absolute left-3 top-3 flex gap-1.5">
          <RatingBadge rating={rating} variant="overlay" />
          {status === "open" && (
            <StatusBadge status="open" variant="compact" />
          )}
          {status === "closed" && (
            <StatusBadge status="closed" variant="compact" />
          )}
        </div>

        {/* Top-right save button */}
        <button
          aria-label={`Save ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onSave?.(id);
          }}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm text-white hover:bg-black/50 transition-colors"
        >
          <Heart size={16} fill={saved ? "currentColor" : "none"} />
        </button>

        {/* Bottom-left photo count */}
        {photoCount > 0 && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg bg-black/45 backdrop-blur-sm px-2 py-0.5 text-xs font-semibold text-white">
            <span>📸</span>
            <span>{photoCount}</span>
          </div>
        )}
      </div>

      {/* Info Section — 45% */}
      <div className="flex flex-col gap-1.5 p-3">
        {/* Row 1: Name + Rating */}
        <div className="flex items-start justify-between">
          <h3 className="text-[17px] font-bold text-text-primary leading-tight">
            {name}
          </h3>
          <RatingBadge rating={rating} variant="inline" />
        </div>

        {/* Row 2: Cuisine · Price · Zone */}
        <p className="text-xs text-text-secondary">
          {cuisine} · {PRICE_LABELS[priceLevel]} · {zone}
        </p>

        {/* Row 3: Review Intelligence Snippet */}
        {reviewSnippet && topDimensionPercent ? (
          <p className="text-xs text-text-secondary">
            <span>🔥 &ldquo;{reviewSnippet}&rdquo;</span>
            <span className="ml-1">
              · {topDimensionPercent}% loved the {topDimensionLabel}
            </span>
          </p>
        ) : restaurant.voteCount > 0 ? (
          <p className="text-xs text-text-muted">
            {restaurant.voteCount.toLocaleString("ro-RO")} reviews
          </p>
        ) : null}

        {/* Row 4: Time Slots */}
        <TimeSlotPills
          slots={availableSlots}
          maxVisible={4}
          onSelect={(slot) => onSlotSelect?.(id, slot)}
        />
      </div>
    </article>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/components/__tests__/restaurant-card.test.tsx --verbose`
Expected: PASS — all 10 tests green

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/components/restaurant-card.tsx src/components/__tests__/restaurant-card.test.tsx
git commit -m "feat: add RestaurantCard (Card B) with photo, rating, status, time slots, review snippet"
```

---

### Task 11: Component Showcase Page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Build a showcase page to visually verify all components**

Replace `src/app/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { Pill } from "@/components/pill";
import { Avatar } from "@/components/avatar";
import { RatingBadge } from "@/components/rating-badge";
import { StatusBadge } from "@/components/status-badge";
import { TimeSlotPills } from "@/components/time-slot-pills";
import { BottomSheet } from "@/components/bottom-sheet";
import { RestaurantCard } from "@/components/restaurant-card";
import type { Restaurant } from "@/lib/types";

const mockRestaurant: Restaurant = {
  id: "1",
  slug: "papila-rezervari-2990",
  name: "Papila",
  cuisine: "Contemporary French",
  priceLevel: 2,
  zone: "Centrul Vechi",
  city: "bucuresti",
  rating: 4.8,
  voteCount: 2968,
  photoUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop",
  photoCount: 42,
  status: "open",
  closesAt: "23:00",
  availableSlots: ["7:00", "7:30", "8:00", "8:30", "9:00"],
  reviewSnippet: "Best carbonara in Bucharest",
  topDimensionLabel: "atmosphere",
  topDimensionPercent: 95,
};

const mockNoPhoto: Restaurant = {
  ...mockRestaurant,
  id: "2",
  name: "Hard Rock Cafe",
  cuisine: "American",
  photoUrl: null,
  photoCount: 0,
  zone: "Herăstrău",
  status: "closed",
  opensAt: "11:30",
  availableSlots: [],
  reviewSnippet: undefined,
  topDimensionLabel: undefined,
  topDimensionPercent: undefined,
};

export default function Showcase() {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-bg p-6">
      <div className="mx-auto max-w-content space-y-12">
        <h1 className="text-4xl font-extrabold text-text-primary">
          Tavli — Design System
        </h1>

        {/* Buttons */}
        <section>
          <h2 className="mb-4 text-xl font-bold">Buttons</h2>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-3">
            <Button fullWidth>Full Width Button</Button>
          </div>
        </section>

        {/* Pills */}
        <section>
          <h2 className="mb-4 text-xl font-bold">Pills</h2>
          <div className="flex flex-wrap gap-2">
            <Pill label="All" active />
            <Pill label="Open Now" icon="🟢" />
            <Pill label="🥂 Brunch" />
            <Pill label="Cuisine" hasDropdown />
            <Pill label="Italian" active dismissible count={153} />
            <Pill label="Price" hasDropdown />
          </div>
        </section>

        {/* Avatars */}
        <section>
          <h2 className="mb-4 text-xl font-bold">Avatars</h2>
          <div className="flex gap-3">
            <Avatar name="Nicoleta" size="sm" />
            <Avatar name="Marius" size="md" />
            <Avatar name="Elena" size="lg" />
            <Avatar name="Radu" />
            <Avatar name="Gabriel" />
            <Avatar name="Cristina" />
          </div>
        </section>

        {/* Rating Badges */}
        <section>
          <h2 className="mb-4 text-xl font-bold">Rating Badges</h2>
          <div className="flex gap-3">
            <RatingBadge rating={4.8} variant="inline" />
            <RatingBadge rating={4.8} voteCount={9549} variant="inline" />
            <div className="rounded-lg bg-gray-800 p-3">
              <RatingBadge rating={4.8} variant="overlay" />
            </div>
          </div>
        </section>

        {/* Status Badges */}
        <section>
          <h2 className="mb-4 text-xl font-bold">Status Badges</h2>
          <div className="flex flex-col gap-2">
            <StatusBadge status="open" closesAt="23:00" />
            <StatusBadge status="closed" opensAt="11:30" />
            <div className="flex gap-2">
              <StatusBadge status="open" variant="compact" />
              <StatusBadge status="closed" variant="compact" />
            </div>
          </div>
        </section>

        {/* Time Slots */}
        <section>
          <h2 className="mb-4 text-xl font-bold">Time Slot Pills</h2>
          <div className="space-y-3">
            <TimeSlotPills slots={["7:00", "7:30", "8:00", "8:30", "9:00"]} />
            <TimeSlotPills slots={["7:00", "7:30", "8:00", "8:30", "9:00"]} selected="8:00" />
            <TimeSlotPills slots={[]} />
          </div>
        </section>

        {/* Bottom Sheet */}
        <section>
          <h2 className="mb-4 text-xl font-bold">Bottom Sheet</h2>
          <Button onClick={() => setSheetOpen(true)}>Open Sheet</Button>
          <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Book a Table">
            <p className="text-text-secondary">Sheet content goes here.</p>
          </BottomSheet>
        </section>

        {/* Restaurant Cards */}
        <section>
          <h2 className="mb-4 text-xl font-bold">Restaurant Cards</h2>
          <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2">
            <RestaurantCard restaurant={mockRestaurant} />
            <RestaurantCard restaurant={mockNoPhoto} />
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify visually in browser**

Run: `npm run dev`
Open: `http://localhost:3000`
Expected: All components render correctly. Check:
- Orange buttons with rounded corners and shadow
- Pills with active/inactive states, counts, icons
- Colored avatar circles with correct initials
- Rating badges in inline and overlay variants
- Open/closed status badges in green/red
- Time slot pills with selection state and empty state
- Bottom sheet opens with backdrop, closes with × and backdrop click
- Two restaurant cards: one with photo and time slots, one with no photo and closed state

- [ ] **Step 3: Run full test suite**

Run: `npm test -- --verbose`
Expected: All tests pass (approximately 45+ tests across all components)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add component showcase page for visual verification"
```

---

### Task 12: Export Barrel + Final Cleanup

**Files:**
- Create: `src/components/index.ts`

- [ ] **Step 1: Create component barrel export**

Create `src/components/index.ts`:

```typescript
export { Button } from "./button";
export { Pill } from "./pill";
export { Avatar } from "./avatar";
export { RatingBadge } from "./rating-badge";
export { StatusBadge } from "./status-badge";
export { TimeSlotPills } from "./time-slot-pills";
export { BottomSheet } from "./bottom-sheet";
export { RestaurantCard } from "./restaurant-card";
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with zero errors.

Run: `npm test -- --verbose`
Expected: All tests pass.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: add component barrel exports, finalize Plan 1"
```
