## Building with Tavli components

Tavli is a Romanian restaurant-booking product. These are the **real** shipped
React components (bundled from source), styled with **Tailwind v4** utility
classes bound to brand design tokens.

### Wrapping (required for text)
Almost every component reads copy through the i18n layer (`useT()`/`useLocale()`).
Wrap the tree in the provided **`MessagesProvider`** with a `locale` and a
`bundle`, or those components render blank:

```jsx
import { MessagesProvider, RestaurantCard, roBundle } from "<pkg>";

<MessagesProvider locale="ro" bundle={roBundle}>
  <RestaurantCard restaurant={r} onClick={() => {}} />
</MessagesProvider>
```

`roBundle` (a Romanian bundle) is exported for convenience. Default locale is
`ro`; `en` and `de` also exist.

### Styling idiom — Tailwind v4 + brand tokens
Compose layout with Tailwind utilities that resolve to the brand tokens. Use
these families (never invent hex values or generic Tailwind colors like
`blue-500`):

| Purpose | Utilities |
|---|---|
| Brand accent | `bg-brand-primary`, `bg-brand-primary-soft`, `text-brand-primary`, `text-brand-primary-dark`, `hover:bg-brand-primary-dark` |
| Surfaces | `bg-surface-white`, `bg-surface-bg` |
| Text | `text-text-primary`, `text-text-secondary`, `text-text-muted` |
| Lines | `border-border` |
| Radii | `rounded-card`, `rounded-button`, `rounded-pill`, `rounded-lg` |
| Type | `font-display` (serif headings), body is the sans default |

The same tokens exist as CSS custom properties (`--color-brand-primary`,
`--color-surface-white`, `--color-text-primary`, `--color-border`,
`--radius-card`, …) defined in `styles.css` (`@theme`) — read it before
styling. The brand accent is a warm terracotta orange; headings use a display
serif; cards use soft shadows + generous radii.

### Where the truth lives
- `styles.css` — the token/utility source (`@theme`) and the component CSS closure.
- `components/<Name>/<Name>.d.ts` + `<Name>.prompt.md` — each component's API + usage.

### A note on this sync
The full Tavli component library is an app, so this sync scopes the **reusable
presentational core** (buttons, pills, chips, badges, cards, sheets, slot
pickers, filters). Components not yet given a rich preview show a floor card but
are fully importable and typed.
