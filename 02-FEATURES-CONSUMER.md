# Consumer-Facing Features — ialoc.ro

## 1. Restaurant Discovery

### Search
- Free-text search — city-scoped (always within the selected city)
- Search scope varies by page context:
  - **Homepage**: "Caută după **numele** sau **specificul** localului" — search by name or characteristics (broader — could include atmosphere, type, etc.)
  - **City page**: "Caută după **nume** sau **bucătărie** în peste 900 de localuri" — search by name or cuisine type (explicit)
  - **Listing page**: "Rezervă online în peste 900 de localuri" — generic prompt
- Note: autocomplete behavior was not verified during research

### Browsing
- Browse by city (17 cities with photo cards)
- Browse by curated collections (Recommended, Friends, Romantic, etc.)
- Browse by cuisine type
- Browse by neighborhood/zone
- Browse by venue type
- Browse by price tier
- Browse by star rating
- "Nearby venues" (location-based, requires geolocation)

### Sorting
- **Popularitate** (Popularity) — default
- **Scor** (Rating score)
- **Nume** (Alphabetical by name)

### Filtering (Left Sidebar)
Six filter categories — all combinable:
1. **Colecție** (Collection) — curated lifestyle tags
2. **Zonă** (Zone/Neighborhood) — geographic areas within a city
3. **Bucătărie** (Cuisine) — type of food
4. **Preț** (Price) — 4-tier scale
5. **Scor** (Score) — star rating filter
6. **Tip local** (Venue Type) — what kind of establishment

Each filter shows a count of matching venues.

## 2. Restaurant Profiles

Each venue has a detailed profile page with:
- **Photo gallery** — carousel with 8+ photos, paginated
- **Star rating** — X.X / 5 format with total vote count
- **Price tier indicator** — $ to $$$$
- **Cuisine type** — primary cuisine
- **Menu** — downloadable PDF link
- **Description** — rich text, expandable ("vezi mai mult")
- **Address** — full street address with zone
- **Map** — embedded Google Maps with pin
- **Directions link** — opens Google Maps navigation
- **Operating hours** — weekday + weekend schedule
- **Characteristics** — full tag list (collection, price, zone, type, cuisine)
- **Restograf integration** — cross-link to Restograf.ro profile
- **Badges**: "event", "meniu", "Nou pe ialoc", discount percentages ("-10%", "-15%", "-100%")

## 3. Reviews & Ratings

**Terminology note:** ialoc uses "voturi" (votes) for the aggregate count, "Păreri" (opinions) for the section header, and "recenzii" (reviews) for individual entries. The vote count includes both text reviews and rating-only submissions.

- **Verified reviews only** — "Doar clienții care au rezervat o masă pot lăsa o recenzie"
- **Star rating per review** (5-star system)
- **Review content**: free text (optional — many reviews are rating-only with no text)
- **Review metadata**: reviewer first name, date posted, date of reservation ("Rezervat în data de...")
- **Restaurant responses** — owners can reply publicly to reviews (with manager name + title, e.g., "Marius Baban, General Manager")
- **Avatar system** — first letter of name in colored circle (different colors per user)
- **Pagination** — "Vezi mai multe recenzii" (See more reviews)
- **Aggregate score** — displayed prominently (e.g., "4,8 / 9549 voturi" — Romanian comma decimal format)

## 4. Reservation System

- **Modal-based booking flow** (overlay on restaurant page)
- **Steps**:
  1. Select number of guests (1-6+ with arrow navigation)
  2. Select date (Astăzi / Mâine / Altă dată with calendar)
  3. Select zone (e.g., Interior / Terasa cu incalzitoare)
  4. Select time slot (presumably next step)
  5. Confirm with personal details
- **Guarantee badge**: "Garantăm că rezervarea ta este transmisă"
- **Language selector**: RO flag visible (likely RO/EN)
- No account required for browsing (reservation may require contact info)

## 5. Nearby Venues

- On each restaurant detail page: "Localuri din apropierea [restaurant name]"
- Shows 4-5 nearby venues with:
  - Photo, name, rating, address
  - **Distance in meters** (e.g., "Distanță: 453 m")
  - Tags/characteristics

## 6. Content & Engagement

- **Blog articles** surfaced on city landing pages (4 recent articles)
- **Newsletter subscription** — CTA in footer on every page
- **Podcast** — linked to Anchor FM
- **Live chat** — customer support chat widget
- **Social media links** — Instagram, Facebook, LinkedIn

## 7. Mobile Apps

- **iOS** — App Store download
- **Android** — Google Play download
- Promoted via footer banner on every page

## 8. Offers & Promotions

- Restaurants can display **discount badges** on their listing cards
- Examples: "-10%", "-15%", "-100%" (likely special promotions)
- Filter: "Cu oferte active" (With active offers) — 40 venues in Bucharest

## 9. Cookie & Privacy

- Cookie consent banner with options: Accept All, Refuse All, Modify Settings
- Granular cookie control: essential, statistics, advertising, livechat
- ANPC (Romanian consumer protection) compliance links
