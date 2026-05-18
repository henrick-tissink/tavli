# Beautiful, Not Plain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Each task aims for a distinctive editorial result; not just polish — rebuild.

**Goal:** Raise the visual bar on the 3 highest-leverage consumer surfaces from "functional with a token coat of polish" to "editorial, distinctive, beautiful." The reservation sheet was the appetizer; this is the main.

**Aesthetic bar:** [[feedback-aesthetic-bar]] — reject the safe default. Photo-led, display-font heroes, layered depth, editorial copy with voice, motion at the moments that matter. Reference: The Infatuation × Resy.

**Surfaces:**
1. **Detail page** — every booking goes through it. Currently 7/10 polish, gap to beautiful is large.
2. **Homepage / city listing** — every visit lands here. Currently 6/10, missing a hero moment.
3. **Reservation confirmation page** — moment of anticipation. Currently doesn't exist as a positive page (only cancel).

**Out of scope (defer):** Map view, search experience, partner dashboards, marketing pages.

---

## SURFACE 1 — Detail page (Tasks 1-7)

### Task 1: Hero overlay strip on photo gallery

**Files:**
- Modify: `src/components/photo-gallery.tsx`
- Modify: `src/app/[city]/(shell)/[slug]/DetailPageClient.tsx` (pass new props)

**Vision:** The first photo of the gallery becomes a magazine cover. The plain `<h1>` in InfoBlock gets dethroned. Instead, the venue name + cuisine + neighborhood + rating sits OVER the photo, anchored at the bottom-left, with a gradient-to-black overlay covering the bottom 40% of the photo.

- [ ] Add optional props to `PhotoGallery`: `overlayTitle?: string`, `overlaySubtitle?: string`, `overlayRating?: { value: number; voteCount: number }`. When present, render a gradient overlay on the first photo with this content.

- [ ] Overlay layout (mobile):
  - Absolute bottom-left, padding `p-5 desktop:p-8`.
  - Gradient: `bg-gradient-to-t from-black/70 via-black/30 to-transparent`, height ~50% of photo.
  - Title in `font-display text-4xl desktop:text-6xl font-bold text-white leading-[0.95] tracking-tight`.
  - Subtitle in `text-white/90 text-sm desktop:text-base mt-2`.
  - Rating chip in `bg-white/15 backdrop-blur-sm border border-white/20 text-white text-sm font-bold px-2.5 py-1 rounded-pill`, positioned top-right of overlay or beside subtitle.

- [ ] In `DetailPageClient`, pass:
  - `overlayTitle={restaurant.name}`
  - `overlaySubtitle={\`${formatCuisines(restaurant.cuisines)} · ${PRICE_LABELS[restaurant.priceLevel]}${restaurant.zone ? ` · ${restaurant.zone}` : ""}\`}`
  - `overlayRating={restaurant.voteCount > 0 ? { value: restaurant.rating, voteCount: restaurant.voteCount } : undefined}`

- [ ] Remove the redundant `<h1>` from `InfoBlock` since name now lives in the hero overlay. Keep address + status badge + CTAs in InfoBlock.

- [ ] Commit: `feat(detail): magazine-cover overlay on hero photo gallery`

---

### Task 2: HeroNote elevated to page centerpiece

**Files:**
- Modify: `src/app/[city]/(shell)/[slug]/DetailPageClient.tsx`

**Vision:** The existing `heroNote` (currently small, italic, sandwiched between dots) becomes the editorial spine of the page — large, breathing, the first thing you read after the hero photo.

- [ ] Locate the current `heroNote` block (around L91-101 of the pre-merge file — find it after merge).

- [ ] Rebuild as:
  ```tsx
  {restaurant.heroNote && (
    <section className="px-4 desktop:px-6 max-w-3xl mx-auto pt-10 desktop:pt-14 pb-6 desktop:pb-10">
      <div className="text-center">
        <span className="inline-block text-brand-primary text-2xl tracking-[0.3em]" aria-hidden>—</span>
        <p className="font-display italic text-text-primary text-2xl desktop:text-3xl leading-snug mt-6 max-w-2xl mx-auto">
          {restaurant.heroNote}
        </p>
        <span className="inline-block text-brand-primary text-2xl tracking-[0.3em] mt-6" aria-hidden>—</span>
      </div>
    </section>
  )}
  ```

- [ ] When heroNote is missing, fall back to a templated editorial intro using `cuisines[0]` and `zone`:
  - "Un loc {cuisine-adjective} în inima zonei {zone}." (table of adjectives per cuisine in a const map)
  - If no zone: just the cuisine line.
  - Use the same visual treatment as the heroNote version.

- [ ] Commit: `feat(detail): elevate heroNote as editorial centerpiece`

---

### Task 3: "Despre" → editorial intro with drop cap

**Files:**
- Modify: `src/app/[city]/(shell)/[slug]/DetailPageClient.tsx`

**Vision:** Replace the generic "Despre" section with a confident editorial paragraph. The first letter gets a drop cap (large display-font letter floated left). The description prose itself stays — but the typography signals "this is editorial, not boilerplate."

- [ ] Replace the "Despre" section heading + paragraph (around the truncation expand logic). New layout:
  ```tsx
  <section className="mt-10 desktop:mt-14 max-w-prose">
    <p className="text-base desktop:text-lg text-text-primary leading-relaxed first-letter:font-display first-letter:text-5xl first-letter:font-bold first-letter:text-brand-primary first-letter:mr-2 first-letter:float-left first-letter:leading-[0.9]">
      {displayDescription}
      {descriptionNeedsTruncation && (
        <button ...> Citește mai mult </button>
      )}
    </p>
    <div className="flex items-center gap-2 flex-wrap mt-4">
      {restaurant.tags.map(...)}
    </div>
  </section>
  ```

- [ ] The "Despre" h3 header goes away. The drop cap is the visual signal.

- [ ] Commit: `feat(detail): editorial drop-cap intro replacing 'Despre' section`

---

### Task 4: Sticky CTA with photo thumbnail

**Files:**
- Modify: `src/app/[city]/(shell)/[slug]/DetailPageClient.tsx` (the `showStickyCta` block around L367-381)

**Vision:** The sticky bottom bar becomes more elegant. Instead of `[name] [rating] [button]`, it shows: round photo thumbnail (40x40, restaurant photo) + venue name + next-available slot inline + a confident Rezervă button. Glass-blur background.

- [ ] New sticky bar:
  ```tsx
  {showStickyCta && (
    <div className="fixed bottom-16 left-0 right-0 z-40 px-3 pb-3 desktop:hidden">
      <div className="rounded-card bg-surface-white/95 backdrop-blur-md border border-border shadow-floating p-2.5 flex items-center gap-3">
        {restaurant.photos[0] && (
          <Image src={restaurant.photos[0]} alt="" width={40} height={40} className="rounded-full object-cover w-10 h-10" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary truncate leading-tight">{restaurant.name}</p>
          {restaurant.availableSlots[0] && (
            <p className="text-xs text-text-secondary leading-tight">Următor disponibil: {restaurant.availableSlots[0]}</p>
          )}
        </div>
        <Button onClick={() => openSheet()} className="px-4">Rezervă</Button>
      </div>
    </div>
  )}
  ```

- [ ] Add a `motion.div` wrapper using framer-motion: `initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}`, transition spring damping 24 stiffness 280. Wrap in `AnimatePresence`.

- [ ] Commit: `feat(detail): elevate sticky CTA with photo thumbnail + glass blur + spring animation`

---

### Task 5: ChefPickCard typography polish

**Files:**
- Modify: `src/app/[city]/(shell)/[slug]/DetailPageClient.tsx` (the `ChefPickCard` component at the bottom)

**Vision:** Currently fine, but make it confident editorial. Dish name in display font is already there. Add italic description, larger photo, "Pick #1/#2/#3" small badge in the corner, and refined price typography.

- [ ] Add `index` prop to `ChefPickCard`. Render badge at top-left of photo: `<span className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm text-text-primary text-[10px] font-bold tracking-[0.2em] uppercase px-2 py-1 rounded-pill">Pick #{index + 1}</span>` for first 3 only.

- [ ] Wrap the description in `<p className="text-sm italic text-text-secondary mt-2 line-clamp-3 leading-relaxed">` (was `text-xs`, now bumped to `text-sm` + italic).

- [ ] Price formatting: `<p className="font-display text-lg font-bold text-brand-primary mt-3">{item.price} <span className="text-sm font-normal text-text-muted">lei</span></p>`.

- [ ] Update grid in DetailPageClient to pass `index` to each card.

- [ ] Commit: `feat(detail): confident editorial chef-pick cards with Pick #N badge`

---

### Task 6: Section header upgrade — display-font + sublines

**Files:**
- Create: `src/components/section-header.tsx`
- Modify: `src/app/[city]/(shell)/[slug]/DetailPageClient.tsx` to use SectionHeader.

**Vision:** All `<h3 className="text-[20px] font-bold">` calls in DetailPageClient become a `<SectionHeader>` with display-font title + optional editorial subline.

- [ ] Component:
  ```tsx
  interface SectionHeaderProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    rightSlot?: React.ReactNode;
  }
  export function SectionHeader({ title, subtitle, icon, rightSlot }: SectionHeaderProps) {
    return (
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h3 className="font-display text-2xl desktop:text-3xl font-bold text-text-primary leading-tight tracking-tight flex items-center gap-2">
            {icon}
            {title}
          </h3>
          {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
        </div>
        {rightSlot}
      </div>
    );
  }
  ```

- [ ] Replace in DetailPageClient:
  - "Recomandările bucătarului" — subtitle "Felurile pe care le poți încerca aici." + Star icon, with "Vezi meniul →" as `rightSlot`.
  - "Recenzii" — subtitle "Ce spun oaspeții recenți."
  - "Program" — subtitle "Când e deschis."
  - "Locație" — subtitle "Cum ajungi."
  - "În apropiere" — subtitle "Și altele aproape de tine."

- [ ] Commit: `feat(ui): SectionHeader primitive with display-font + editorial subtitle`

---

### Task 7: Detail page editorial flow polish

**Files:**
- Modify: `src/app/[city]/(shell)/[slug]/DetailPageClient.tsx`

**Vision:** Cumulative micro-edits to make the page flow editorial.

- [ ] After the hero photo and before the heroNote section, on mobile, kill the redundant `<InfoBlock>` `<h1>` since the overlay now has the name. InfoBlock should now show: address with map pin, status badge, primary "Rezervă o masă" CTA, event-private CTA. No name, no rating chip (those are in the overlay).

- [ ] On desktop, the InfoBlock lives in the right column — keep the name there with display-font since the overlay isn't visible until you click into the gallery. Use a conditional.

  ACTUALLY: simpler approach — the overlay is on the photo gallery which is full-width at the top. So both mobile and desktop see it. Keep InfoBlock without the H1 on both. The desktop version of "name in big" lives in the overlay too.

- [ ] Wrap `<HeroNote>` and `<EditorialIntro>` (the drop-cap paragraph) in a max-w-3xl container so the typography breathes on desktop. Center the heroNote section, left-align the intro.

- [ ] Between sections, add `<hr className="border-t border-border my-10 desktop:my-14 max-w-3xl mx-auto" />` after heroNote and after the editorial intro. Subtle dividers reinforce the editorial layout.

- [ ] Commit: `feat(detail): editorial flow — kill redundant H1, add breathing dividers, max-w-3xl text columns`

---

## SURFACE 2 — Homepage / city listing (Tasks 8-10)

### Task 8: Cover hero block at top of FeedPage

**Files:**
- Create: `src/components/city-cover-hero.tsx`
- Modify: `src/app/[city]/(shell)/FeedPageClient.tsx`

**Vision:** The very top of `/[city]` becomes a full-bleed cover photo (16:9 mobile, 21:9 desktop), darkened with a gradient, with display-font headline + subline + primary CTA. The photo rotates from the top trending restaurant's photo (or a curated list of city dining photos).

- [ ] Component:
  ```tsx
  interface CityCoverHeroProps {
    cityDisplay: string;        // "București"
    backgroundPhotoUrl?: string;
    greeting: string;            // existing time-aware "Bună dimineața"
    availableTonightCount: number;
    onSearch: () => void;        // opens FilterSheet or scroll to grid
  }
  ```

- [ ] Layout:
  - Full-bleed: `relative w-screen left-1/2 -translate-x-1/2 h-[420px] desktop:h-[520px]`.
  - Background: `<Image fill priority>` with the photoUrl, fallback to gradient.
  - Overlay: `absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/70`.
  - Content: centered, vertical stack.
    - Eyebrow: `<p className="text-white/80 text-xs tracking-[0.3em] uppercase">{greeting}</p>`
    - Headline: `<h1 className="font-display italic text-5xl desktop:text-7xl text-white font-bold leading-[0.95] tracking-tight mt-3">{cityDisplay},<br/>la masă.</h1>`
    - Subline: `<p className="text-white/90 text-base desktop:text-lg mt-4 max-w-md mx-auto">Avem {availableTonightCount} {availableTonightCount === 1 ? "loc disponibil" : "locuri disponibile"} pentru diseară.</p>`
    - CTA: `<button onClick={onSearch} className="mt-7 inline-flex items-center gap-2 px-7 py-3.5 rounded-pill bg-white text-text-primary font-semibold text-sm hover:bg-white/95 transition-colors shadow-floating">Caută o masă <ArrowRight size={16}/></button>`

- [ ] In `FeedPageClient`, replace the `ContextBanner` at the top with `<CityCoverHero>`. Pass:
  - `cityDisplay` (already computed)
  - `backgroundPhotoUrl={trending[0]?.photoUrl}` — use the top trending venue's photo
  - `greeting={timeContext.greeting}`
  - `availableTonightCount={filteredRestaurants.filter(r => r.availableSlots.length > 0 && r.status === "open").length}`
  - `onSearch={() => setFilterSheetOpen(true)}` (opens FilterSheet)

- [ ] Keep the `ContextBanner` removed (the cover hero replaces its function with much more presence).

- [ ] Commit: `feat(home): cover hero — full-bleed photo, display-font headline, primary search CTA`

---

### Task 9: Section header upgrades on homepage

**Files:**
- Modify: `src/app/[city]/(shell)/FeedPageClient.tsx`

**Vision:** Apply the `SectionHeader` (built in Task 6) to the homepage sections.

- [ ] Replace the inline `<h2 className="text-[20px]...">Disponibile astăzi</h2>` with `<SectionHeader title="Disponibile astăzi" subtitle="Locurile cu masă în următoarele ore." />`.

- [ ] For `HorizontalSection` ("Populare în București", "Noi pe Tavli"), update the component to accept a `subtitle` prop and render it. Use:
  - "Populare în {city}" → subtitle: "Cele mai rezervate în această săptămână."
  - "Noi pe Tavli" → subtitle: "Locuri proaspăt deschise sau abia listate."

- [ ] Apply SectionHeader to "În apropiere" on the detail page too (covered by task 6 already — verify).

- [ ] Commit: `feat(home): SectionHeader upgrade with editorial subtitles`

---

### Task 10: Editorial pull-quote interstitial between sections

**Files:**
- Create: `src/components/editorial-interstitial.tsx`
- Modify: `src/app/[city]/(shell)/FeedPageClient.tsx`

**Vision:** Once between the "Populare" and "Disponibile astăzi" sections, an editorial pull-quote. Subtle but distinctive. Time-aware (different copy by time-of-day, leveraging `timeContext`).

- [ ] Component:
  ```tsx
  interface EditorialInterstitialProps {
    eyebrow?: string;   // small uppercase tag
    body: string;       // pull-quote text
    attribution?: string; // small line beneath
  }
  ```
  Layout: centered max-w-2xl, italic display-font body at text-xl, eyebrow at top in tracking-[0.3em] uppercase brand-primary, attribution at bottom in text-text-muted.

- [ ] In `FeedPageClient`, inject between `HorizontalSection` and the "Disponibile astăzi" grid. Pick one of three editorial pull-quotes based on `timeContext`:
  - Morning: "Cei mai buni meseni încep planificarea de dimineață. Caută masă pentru diseară." (eyebrow: "PUTINĂ INSPIRAȚIE")
  - Afternoon: "Bucureștiul devine un alt oraș la apus. Reține-ți locul." (eyebrow: "DUPĂ-AMIAZĂ")
  - Evening/night: "În seara asta, în {city}, oamenii deja stau la mese. Și tu poți." (eyebrow: "SEARA")

- [ ] Commit: `feat(home): editorial pull-quote interstitial between sections`

---

## SURFACE 3 — Reservation confirmation page (Tasks 11-12)

### Task 11: Build celebratory confirmation page

**Files:**
- Modify: `src/app/reservations/[token]/page.tsx` — extend to handle "confirmed" status with a positive view, not just cancel.
- Create: `src/components/reservation-confirmed.tsx`
- Modify: `src/lib/repos/reservations-repo.ts` (or similar) — fetch full reservation incl. restaurant photo + heroNote

**Vision:** When the user lands on `/reservations/[token]` and the reservation is `confirmed` (default state for new reservations), show a CELEBRATION page — venue cover photo, big display-font date, "Te așteaptă la {name}" headline, practical info card with map + phone + add-to-calendar, optional editorial "Ce să te aștepți" pulling from heroNote, and a small secondary "Anulează rezervarea" link at the bottom that opens the existing cancel form inline.

- [ ] Extend `loadReservation()` to also pull `restaurants(name, photos, hero_note, address, phone, lat, lng)`.

- [ ] Update the result type to include `kind: "confirmed"` (default for any active reservation) with the additional fields.

- [ ] Move the existing cancel-form view to be opened by a button rather than the default view.

- [ ] New `ReservationConfirmed` component:
  - Top: full-bleed venue photo (320px tall on mobile, 480px desktop), gradient overlay, display-font venue name + date+time overlaid at the bottom-left.
  - Below: confirmation card with:
    - Eyebrow: "CONFIRMAT" in brand-primary, tracking wide.
    - Headline: `font-display text-3xl desktop:text-4xl` — "Te așteaptă {date weekday}, {time}."
    - Body: "Pentru {N} persoane, la {restaurantName}." + optional zone.
  - Editorial section: if heroNote exists, show it as a small pull-quote with "Ce te așteaptă" eyebrow.
  - Practical info grid:
    - "Adresa" + address + map button
    - "Telefon" + phone (if available)
    - "Adaugă în calendar" button (generate .ics file download or Google Calendar link)
  - Below in a thin footer-style block: "Trebuie să anulezi?" → "Anulează rezervarea" link that scrolls to the existing cancel form (which we keep but de-prioritize visually).

- [ ] Calendar download: use a simple .ics generation utility. Output:
  ```
  BEGIN:VCALENDAR
  VERSION:2.0
  PRODID:-//Tavli//RO
  BEGIN:VEVENT
  UID:{token}@tavli.ro
  DTSTAMP:{now-utc}
  DTSTART:{date}T{time}
  DTEND:{date}T{time+2h}
  SUMMARY:Rezervare la {restaurantName}
  LOCATION:{address}
  END:VEVENT
  END:VCALENDAR
  ```
  Render as `<a href="data:text/calendar;charset=utf-8,..." download="rezervare-tavli.ics">`.

- [ ] Commit: `feat(reservation-confirmed): build celebratory confirmation page with venue hero, calendar download, secondary cancel`

---

### Task 12: Wire ReservationSheetV2 StepSent to the confirmation page

**Files:**
- Modify: `src/components/reservation-sheet-v2/StepSent.tsx`
- Modify: `src/components/reservation-sheet-v2/index.tsx` (orchestrator passes confirmation token instead of just reservationId)
- Modify: `src/app/api/reservations/actions.ts` — ensure `createReservation` returns the confirmation_token so the success path can deep-link.

**Vision:** The "Vezi rezervarea" button in StepSent should lead to the new beautiful confirmation page — currently it links to `/reservations/{reservationId}` which doesn't match the actual route `/reservations/[token]`.

- [ ] Update `CreateReservationResult` type — already has `confirmationToken?: string`. Confirm it's returned in the action.

- [ ] Update `StepSent` props to accept `confirmationToken?: string` instead of (or alongside) `reservationId`. The "Vezi rezervarea" link should point to `/reservations/{confirmationToken}` only when the token exists.

- [ ] In `ReservationSheetV2/index.tsx`, store `confirmationToken` from the action result alongside `reservationId`. Pass to `StepSent`.

- [ ] Update the existing test for `StepSent` that asserts the href.

- [ ] Commit: `fix(reservation-sheet-v2): StepSent links to /reservations/{confirmationToken} (matches actual route)`

---

## Cross-cutting QA

After all tasks merge:
- [ ] Run full test suite. All previous 535 tests + new tests must pass.
- [ ] Run typecheck. Clean.
- [ ] Manual visual smoke: hit homepage, drill into a venue, complete a booking, land on the confirmation page. Confirm each transition feels intentional and beautiful.
- [ ] Lighthouse mobile score should not regress.
- [ ] No new layout-shift warnings in dev tools.

## Out of scope (write down so we don't drift)

- Map view restyle
- Search experience (input UX, results page)
- Footer restyle
- Mobile bottom nav redesign
- City selector polish
- Partner dashboards
- i18n expansion
