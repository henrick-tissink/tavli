# Restaurant Detail Page — ialoc.ro

## URL Pattern
```
/restaurante-{city}/{slug}-rezervari-{id}
```
Example: `/restaurante-bucuresti/hard-rock-cafe-rezervari-1268`

## Page Title Format
```
{Name}, {City} - Rezervă o masă online - {Types} din {Zone}.
```
Example: "Hard Rock Cafe, București - Rezervă o masă online - Restaurant, evenimente din Herãstrãu."

## Page Structure

### Header Bar (Sticky)
- ialoc logo (links to homepage)
- Search bar: "Rezervă online în peste 900 de localuri"
- City selector dropdown

### Breadcrumbs
```
Home > {City} > Restaurante > {Zone}
```

### Main Content Area (Two-Column Layout)

#### Left Column — Photo Gallery
- Carousel with 8+ high-resolution photos
- Thumbnail pagination (numbered dots)
- Previous/Next navigation arrows
- Photos served from CloudFront CDN
- Conversion format: `{slug}-big.jpg`

#### Right Column — Restaurant Info Card
- **Restaurant name** + badges (e.g., "event" tag)
- **Star rating**: visual stars + "X,X / YYYY voturi" (Romanian comma decimal)
- **Price tier**: "Preț Moderat" (with icon)
- **Primary cuisine**: e.g., "Americană" (with icon)
- **Menu link**: downloadable PDF (with icon)
- **Restograf cross-link**: "Citește mai multe pe RESTOGRAF" (with Restograf logo)
- **Address**: full street address with zone and city (with icon)
- **CTA Button**: "Rezervă o masă online" (large, red, prominent)

### Description Section
- Rich text description of the restaurant
- Expandable with "+ vezi mai mult" link
- Below: Google Maps link "Vezi cum se ajunge la {name}"

### Map Section
- Embedded Google Maps with restaurant pin
- Clickable — opens Google Maps with directions

### Schedule Section
- **Program** heading
- Weekday hours (Luni - Vineri): e.g., "11:30 - 00:00"
- Weekend hours (Sâmbătă - Duminică): e.g., "12:00 - 00:00"

### Characteristics Section
- Full list of tags as clickable links:
  - Collection tags (Recomandat de ialoc, Cu terasă, Dog Friendly)
  - Price tag (Moderat)
  - Zone tag (Zona Herăstrău)
  - Venue type tags (Restaurant, Evenimente, Burger, Pet friendly, Dog friendly)
  - Cuisine tag (Bucătărie Americană)

### Reviews Section
- **Header**: "Păreri despre {name}"
- **Aggregate rating**: stars + "X.X / YYYY voturi"
- **Trust notice**: "Doar clienții care au rezervat o masă la {name} pot lăsa o recenzie"
- **Individual reviews**:
  - Avatar (first letter of name, colored circle)
  - Reviewer first name
  - Star rating (5 stars visual)
  - Date posted (e.g., "16 aprilie 2026 10:48")
  - Reservation date: "Rezervat în data de 15 aprilie 2026"
  - Review text (free-form, can be empty — rating-only reviews exist)
- **Restaurant responses**:
  - Restaurant avatar/logo
  - Restaurant name
  - Response date
  - Response text (often signed by manager name + title)
- **Pagination**: "Vezi mai multe recenzii" button

### Nearby Venues Section
- **Header**: "Localuri din apropierea {name}"
- 5 venue cards in horizontal layout, each with:
  - Photo thumbnail
  - Restaurant name (with badges like discount percentage)
  - Star rating + vote count
  - Address
  - **Distance**: "Distanță: XXX m"
  - Tag pills (collection, price, zone, type, cuisine)

## Badges & Special Indicators

| Badge | Meaning |
|-------|---------|
| `event` | Venue hosts events |
| `meniu` | Menu PDF available |
| `Nou pe ialoc` | Newly listed on the platform |
| `-10%`, `-15%`, `-100%` | Active discount/promotion |
| `Recomandat de ialoc` | Editorially recommended |
