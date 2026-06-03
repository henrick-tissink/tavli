# Reservation Flow — ialoc.ro

## Entry Point

The reservation is triggered by clicking the red **"Rezervă o masă online"** CTA button on any restaurant detail page. This opens a **modal overlay** on top of the current page.

## Modal Header
- Close button (X)
- Restaurant name: e.g., "Hard Rock Cafe"
- Language/country selector: Romanian flag + "RO"
- Trust badge: "Garantăm că rezervarea ta este transmisă" (with info icon)

## Step 1: Number of Guests (NUMĂRUL DE PERSOANE)

- Horizontal number selector: 1, 2, 3, 4, 5, 6
- Default: 2 (highlighted in red)
- Left/right arrows to scroll for larger party sizes (6+)
- Clean button-style selection

## Step 2: Reservation Date (DATA REZERVĂRII)

- Three quick options:
  - **Astăzi** (Today) — red/selected by default
  - **Mâine** (Tomorrow) — outlined
  - **Altă dată** (Other date) — with calendar icon, opens date picker

## Step 3: Seating Zone (ZONA)

- Restaurant-specific options, e.g.:
  - **Interior** — indoor seating
  - **Terasa cu incalzitoare** — terrace with heaters
- Button-style selection

## Step 4: Time Slot (Inferred — not visible in initial state)

- Likely shows available time slots after zone selection
- Probably 30-minute intervals based on restaurant availability

## Step 5: Confirmation (Inferred)

- Likely collects:
  - Name
  - Phone number
  - Email (optional)
  - Special requests/notes
- Confirmation via email/SMS

## Key UX Characteristics

- **No account required** for browsing — reservation may require contact info only
- **Modal-based** — user stays on the restaurant page
- **Progressive disclosure** — steps revealed one at a time
- **Quick defaults** — 2 guests, today's date pre-selected
- **Visual selection** — button-based choices, not dropdowns
- **Trust signals** — guarantee badge, verified review system
- **Multi-language hint** — RO flag suggests possible language switching

## Post-Reservation (Inferred from Reviews)

- Confirmation sent to user (email/SMS)
- After dining, user receives invitation to leave a review
- Only verified diners (who booked through ialoc) can review
- Reviews show both posting date and reservation date
