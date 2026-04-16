# Design Critique — What ialoc.ro Gets Wrong

## Visual Design

### The Bad
- **Dated aesthetic** — feels like a 2016 website. Heavy use of generic stock photo hero banners, red/white/black color palette feels corporate and uninspired
- **City cards are dull** — all 17 cities use the same red-tinted overlay on generic photos. They look identical at a glance
- **Restaurant cards are text-heavy** — small thumbnails, lots of tags dumped as plain text. Hard to scan visually
- **No visual hierarchy** on listing page — every card looks the same weight. Nothing guides the eye
- **Footer is enormous** — 17 city links + legal links + social + newsletter + app download all crammed together
- **Blog lives on a separate WordPress site** — completely different design language, feels disconnected
- **The logo** — a map pin with a fork. Generic restaurant platform aesthetic

### The Good (Keep These)
- Clean reservation modal — straightforward, not over-designed
- Verified reviews system builds trust
- Tag/filter system is comprehensive with accurate counts
- Consistent red brand color used confidently (even if the color itself could be warmer)
- Photo gallery on detail pages is functional with clear pagination

## UX / Interaction Design

### The Bad
- **No map view** — for a location-based service, there's no way to browse restaurants on a map. This is a massive gap
- **No user accounts visible** — no favorites, no reservation history, no personalized recommendations
- **Search is basic** — no visible trending searches, no AI-powered recommendations, no natural language queries (autocomplete behavior not verified but search UX appears minimal)
- **Filters are desktop-only sidebar** — on mobile, this is likely a hamburger menu or hidden entirely
- **Pagination instead of infinite scroll** — 10+ pages of results feels archaic
- **Photos in listing cards are tiny and ineffective** — each card has a small thumbnail on the left, but they're too small to be appetizing or to differentiate venues visually. Worse, many restaurants show a **generic ialoc placeholder image** (the fork-in-pin logo) instead of real photos — making those cards visually dead. Compare to Airbnb's visual-first approach with large hero images
- **Sort options are minimal** — no "distance from me", no "best reviewed", no "trending"
- **No time-aware features** — doesn't surface "open now", "available tonight", "last-minute deals"
- **Review section is a wall of text** — no filtering, no sorting, no helpful/not helpful votes, no photo reviews

### The Good (Keep These)
- Progressive disclosure in reservation flow
- Distance indicators on nearby venues
- Breadcrumb navigation with zone-level granularity
- Restaurant responses to reviews — creates a dialogue, shows restaurants care
- Trust badge on reservation ("Garantăm că rezervarea ta este transmisă")
- Filter counts update to show available venues per option — useful for narrowing down
- City landing page has clear dual CTAs: explore all venues vs. nearby venues

## Information Architecture

### The Bad
- **About page is bare** — no team, no story, no stats, no social proof. Just a wall of marketing copy about the three products
- **No cuisine/collection landing pages** — you can filter, but there's no curated "Best Italian in Bucharest" page with editorial content
- **No event/special occasion features** — no birthday, anniversary, or group dining tools
- **Zone descriptions don't exist** — neighborhoods are just filter labels, not discoverable areas with descriptions
- **Cross-linking is weak** — Restograf.ro integration feels like an afterthought. Why link away to a competitor?

## Performance & Technical

- Server-rendered HTML — good for SEO, but feels slow
- Images could be better optimized (CloudFront helps, but format/size choices aren't great)
- No PWA / offline capabilities
- Cookie consent is a full-screen blocker — aggressive and annoying

## Mobile Experience

- Responsive but not mobile-first — the desktop experience is clearly primary
- No visible app-web integration (deep links, smart banners beyond footer)
- The filter sidebar likely collapses into something less usable on mobile

## Brand & Positioning

- **"ialoc"** — not immediately clear what it means to non-Romanian speakers. "I-a loc" = "take a spot/place" in Romanian. Clever wordplay but limited international potential
- **No personality** — the brand feels like a utility, not an experience. Compare to how TheFork or Resy have distinct brand voices
- **The red color** — aggressive and cold. Doesn't evoke the warmth of dining out
