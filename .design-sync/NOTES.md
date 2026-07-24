# design-sync notes — Tavli

Tavli is a **Next.js app**, not a standalone design-system library. The sync
runs in package/synth-entry mode (no component `dist/`). All decisions + the
setup landscape are captured here so a re-sync is reproducible.

## Locked decisions (2026-07-24)
- **Target project: the EXISTING "Tavli Design System"** (`95ba54ef-187e-4fd4-b6e5-e41132dc6903`)
  — user chose to **augment** it (re-adoption). It already holds a **hand-built**
  system (`ui_kits/{admin,mobile,onboarding,partner,web}`, `preview/*.html`,
  `assets/`, `colors_and_type.css`, `SKILL.md`).
- **DELETE-SAFETY (critical): this is a write-only augment.** On upload,
  `finalize_plan` deletes MUST be `[]`. Do NOT run the atomic-path delete
  reconciliation (which would nuke the hand-built `ui_kits/`, `preview/`,
  `assets/`, `colors_and_type.css`). The only overwrite the user accepted is
  `README.md`. Result is a deliberate hybrid.
- **Scope: core design system, ~22 reusable presentational components** (see
  `componentSrcMap`). Excluded: `useRouter` components (throw outside Next —
  auth-locale-switcher, filter-pill-bar, site-footer), context-heavy
  sheets/forms, maps, app-shell.

## The 4 setup pieces (Tavli-app specific — the real work)
1. **Synth-entry bundling** — no `dist`; converter bundles each component from
   `src/` via esbuild + `tsconfig.json` paths (`@/*`). No `--entry` flag.
2. **i18n provider** — nearly every component uses `useT()`/`useLocale()`.
   Handled via `cfg.provider = MessagesProvider` + `roBundle` (`.design-sync/preview-bundle.ts`,
   merged through `extraEntries`).
3. **next/* stubs** — components import `next/image` (and a few `next/link`).
   esbuild must alias these to lightweight stubs (`next/image` -> plain `<img>`,
   `next/link` -> `<a>`). Likely needs an esbuild-alias override (fork
   `lib/bundle.mjs`'s esbuild opts, or a `cfg`-driven alias if one exists —
   check `grep ASSUMPTION .ds-sync/lib/*.mjs`). **Not yet wired — first blocker.**
4. **Tailwind v4 CSS** — `src/app/globals.css` is `@import "tailwindcss"` +
   `@theme inline` tokens; it does NOT contain compiled utilities. Components
   use Tailwind utility classes, so `cfg.cssEntry` points at a **compiled**
   `.design-sync/compiled.css`. Generate it before the build, e.g.:
   `npx @tailwindcss/cli -i src/app/globals.css -o .design-sync/compiled.css`
   (must be run against the repo so it scans `src/**` for used classes).
   **Not yet generated — second blocker.**

## Resume plan (where to pick up)
1. Generate `.design-sync/compiled.css` (Tailwind v4 CLI, scanning `src/`).
2. Stage scripts: `mkdir -p .ds-sync && cp -r <skill>/…` (per non-storybook §7),
   `npm i esbuild ts-morph @types/react` in `.ds-sync/`.
3. Wire the next/* alias (piece 3) — first build will reveal exactly what fails.
4. `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle` (synth mode, no --entry).
5. `node .ds-sync/package-validate.mjs ./ds-bundle`; iterate the §3 self-heal tags.
6. Author previews for the scoped set, grade, review, then **atomic upload with deletes=[]**.

## Re-sync risks / watch-list
- `roBundle` namespaces are pinned in `preview-bundle.ts`; if a scoped component
  starts using a new namespace, add it there or its `useT` throws blank.
- `compiled.css` is a generated artifact (Tailwind scan of `src/`) — regenerate
  on re-sync; it's gitignored.
- The augment/delete-safety rule above is the single most important invariant —
  never let a re-sync derive deletes from the project's non-sync files.
