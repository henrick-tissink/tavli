# Platform Architecture — ialoc.ro

## Site Map

```
ialoc.ro/
├── / (Homepage — city selector + search)
├── /{city} (City landing page, e.g., /bucuresti)
├── /restaurante-{city} (Full listing with filters, e.g., /restaurante-bucuresti)
├── /restaurante-{city}/{slug}-rezervari-{id} (Restaurant detail page)
├── /despre-ialocro (About page)
├── /confidentialitate (Privacy policy)
├── /politica-utilizarii-de-cookies (Cookie policy)
├── /termeni-si-conditii (Terms & conditions)
├── /lacafea/ (Blog — separate WordPress site)
│
├── restaurant.ialoc.ro (B2B portal — ialoc Business)
│
├── iOS App (via App Store)
├── Android App (via Google Play)
│
└── External integrations:
    ├── Sendinblue/Brevo (Newsletter via sibforms.com)
    ├── Anchor FM (Podcast)
    ├── Restograf.ro (Cross-linked restaurant profiles)
    ├── Google Maps (Directions/map embeds)
    └── CloudFront CDN (d2fdt3nym3n14p.cloudfront.net for images)
```

## Page Types

### 1. Homepage (`/`)
- Hero with background food photo
- City selector dropdown (17 cities)
- Search bar: "Caută după numele sau specificul localului"
- Grid of 17 city cards with photos (clickable)
- Footer with newsletter, app download, business CTA

### 2. City Landing Page (`/{city}`)
- City-specific hero + search ("Descoperă București")
- Quick-access buttons: "Descoperă X localuri" and "Localuri din apropiere"
- 5 collection shortcuts (icons): Recomandate, Cu Prietenii, Romantic, Child Friendly, Nou în oraș
- "Cele mai rezervate" (Most Booked) — horizontal card carousel (8 venues)
- "Cele mai recente articole" (Latest Blog Articles) — 4 article cards
- "Recomandate de ialoc" (ialoc Recommended) — horizontal card carousel (8 venues)

### 3. Listing Page (`/restaurante-{city}`)
- Sticky top bar: logo, search, city selector
- SEO description paragraph at top (e.g., "Rezervă o masă în peste 1,000 de localuri din București...")
- Sort dropdown ("Ordonează după"): Popularitate (default), Scor, Nume
- Left sidebar with collapsible filter groups (6 categories with venue counts)
- Main content: paginated list of venue cards (15 per page)
- Breadcrumbs: Home > City > Restaurante
- Pagination (10+ pages, numbered 1-10 with next arrow)

**Listing Card Structure** (each venue card contains):
- Photo thumbnail (left side) — note: many venues show a generic ialoc placeholder (fork-in-pin logo) instead of real photos
- Restaurant name + optional badges: `meniu`, `event`, `Nou pe ialoc`, discount % (e.g., "-10%")
- Star rating (visual 5-star) + "(X,X / YYYY voturi)" — Romanian comma decimal format
- Address with location pin icon, formatted as "Street, Zone, City"
- Tag pills row: collection badges (Recomandat de ialoc, Dog Friendly, etc.), price tier, zone link, venue type links, cuisine links
- Entire card is clickable (links to detail page)

### 4. Restaurant Detail Page (`/restaurante-{city}/{slug}`)
- Photo gallery carousel (8+ images)
- Restaurant info sidebar (name, rating, price, cuisine, menu PDF, address, CTA)
- Description text (expandable)
- Google Maps embed with directions link
- Operating hours (schedule)
- Characteristics/tags
- Reviews section with verified reviews + restaurant replies
- "Nearby venues" section with distance indicators
- Reservation modal (triggered by CTA)

### 5. Blog (`/lacafea/`)
- Separate WordPress-powered site
- Article grid with featured images
- Categories: top lists, testimonials, guides, recommendations
- Branded as "La cafea" (At coffee)

## Navigation

- **Header**: Logo + Search bar + City dropdown selector
- **Footer** (consistent across all pages):
  - Newsletter subscription CTA
  - Mobile app download links (iOS + Android)
  - Business CTA ("Ai un restaurant?")
  - Links: Blog, Podcast, Chat, About, Privacy, Cookies, T&C, ANPC
  - All 17 city quick links
  - Social media: Instagram, Facebook, LinkedIn

## Technical Notes

- Server-rendered HTML (not a SPA)
- CloudFront CDN for image delivery
- Image conversions: `-big.jpg` suffix for gallery photos
- Reservation form appears as a modal overlay
- Cookie consent banner with granular settings
- Live chat widget (embedded iframe)
- Brevo/Sendinblue for email marketing
