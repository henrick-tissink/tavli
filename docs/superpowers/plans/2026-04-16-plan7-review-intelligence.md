# Plan 7: Review Intelligence Processing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the review intelligence processing pipeline — the system that takes raw review text and extracts sentiment dimensions, top mentions, best-for tags, and trend direction. Then wire it into Card B snippets and search matching.

**Architecture:** Client-side processing of mock review data. A pure function pipeline: raw reviews → keyword classification → dimension scoring → phrase extraction → tag generation. Results feed into RestaurantCard review snippets and SearchOverlay matching.

**Tech Stack:** TypeScript, existing components.

**Spec reference:** `docs/superpowers/specs/2026-04-16-ui-ux-design.md` — Section 9 (Review Intelligence System)

---

### Task 1: Review Intelligence Processor

**Files:**
- Create: `src/lib/review-processor.ts`
- Create: `src/lib/__tests__/review-processor.test.ts`

- [ ] **Step 1: Write tests + implement**

Pure functions, no React:

```typescript
export function processReviews(reviews: Review[]): ReviewIntelligence | null
```

Returns null if fewer than 5 reviews (threshold for meaningful data — spec says 20 but we have limited mock data).

Processing steps:

1. **Dimension scoring**: For each review text, classify mentions into 4 dimensions (Food, Service, Atmosphere, Value) using keyword matching. Each mention is positive or negative based on a sentiment lexicon. Calculate percentage positive per dimension. Only include dimensions with 5+ mentions.

Keyword lists (multilingual — EN, RO, TR):
- Food: food, taste, dish, menu, delicious, fresh, flavor, cook, mâncare, gustos, meniu, lezzetli, yemek, pizza, pasta, burger, steak, sushi
- Service: service, waiter, staff, friendly, fast, slow, attentive, rude, ospătar, personal, chelner, garson, hizmet, servis
- Atmosphere: atmosphere, ambiance, music, decor, vibe, cozy, view, romantic, atmosferă, ambient, muzică, ortam, dekor
- Value: price, value, worth, expensive, cheap, portion, bill, preț, scump, ieftin, fiyat, pahalı, ucuz

Positive words: great, excellent, amazing, perfect, wonderful, fantastic, outstanding, best, love, incredible, superb, delicious, fresh, friendly, beautiful, minunat, excelent, delicios, harika, mükemmel, muhteşem
Negative words: bad, terrible, awful, worst, horrible, disgusting, rude, cold, slow, disappointing, overpriced, prost, rău, oribil, dezamăgitor, kötü, berbat

2. **Top mentions**: Extract 2-3 word phrases that appear in 2+ reviews. Count frequency. Sort by count descending. Max 5.

Simple approach: for each review, extract all 2-gram and 3-gram phrases. Count across all reviews. Filter to phrases appearing 2+ times. Sort by frequency.

3. **Best-for tags**: Pattern match on review text to assign tags. If 3+ reviews mention "date", "romantic", "couple" → tag "Date night". If 3+ mention "friend", "group", "fun" → tag "Friends". If 3+ mention "business", "meeting", "professional" → tag "Business". Etc.

Tag rules:
- "Date night": date, romantic, couple, anniversary, intimate
- "Friends": friend, group, fun, party, gang
- "Business": business, meeting, professional, corporate, lunch meeting
- "Families": family, kid, child, children, copii
- "Terrace": terrace, outdoor, garden, terasă, bahçe
- "Live music": music, live, band, concert, muzică

4. **Trend direction**: Compare average rating of most recent half vs older half. If recent > older + 0.1: "up". If recent < older - 0.1: "down". Else "stable".

Tests:
- processReviews with <5 reviews returns null
- processReviews with 8+ reviews returns intelligence with dimensions
- Dimension percentages are between 0-100
- Top mentions are sorted by frequency
- Best-for tags match keyword patterns
- Trend direction computed correctly

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add review intelligence processor with sentiment, mentions, tags"
```

---

### Task 2: Wire Review Intelligence Into Mock Data

**Files:**
- Modify: `src/lib/mock-data.ts`

- [ ] **Step 1: Generate intelligence from reviews**

For each restaurant in getRestaurantDetail, instead of hardcoding the reviewIntelligence, compute it from the reviews using processReviews. This means the mock detail data's reviewIntelligence field becomes derived rather than static.

Update getRestaurantDetail to call processReviews(detail.reviews) and assign the result to reviewIntelligence.

Also: for Card B in the feed, the review snippet and topDimensionPercent should come from the processed intelligence. Add a helper:

```typescript
export function getCardReviewData(slug: string): { reviewSnippet?: string; topDimensionLabel?: string; topDimensionPercent?: number } | null
```

This runs processReviews for the restaurant (if detail data exists) and extracts the top mention as the snippet and the highest dimension as the label/percent.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: derive review intelligence from mock review data via processor"
```

---

### Task 3: Wire Into Search

**Files:**
- Modify: `src/components/search-overlay.tsx`

- [ ] **Step 1: Enhance search with mention matching**

When searching, also match against the restaurant's top mentions (not just name and cuisine). This means a search for "cocktails" should surface restaurants whose reviews mention cocktails even if their cuisine isn't "Cocktail Bar."

Implementation: in the search results logic, for each restaurant, check if the query matches any topMention phrase from the processed intelligence. If so, include it in results with a label like "Mentioned in reviews: '{phrase}'".

This requires loading the processed intelligence for each restaurant during search. Since we have limited mock data, this is fine performance-wise.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: enhance search with review mention matching"
```

---

### Task 4: Exports + Cleanup

Update `src/lib/index.ts`: export processReviews, getCardReviewData.
Verify build + tests.
Commit: `git commit -m "chore: export review intelligence processor"`
