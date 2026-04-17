import type { Review, ReviewIntelligence } from "@/lib/types";

const DIMENSION_KEYWORDS: Record<string, string[]> = {
  Food: [
    "food", "taste", "dish", "menu", "delicious", "fresh", "flavor", "cook",
    "quality", "pasta", "wine", "burger", "pizza", "sushi", "fish", "meat",
    "dessert", "sarmale", "carbonara", "appetizer", "appetizers", "mains",
    "chef", "tasting",
  ],
  Service: [
    "service", "waiter", "staff", "friendly", "fast", "slow", "attentive",
    "rude", "waited", "server", "professional",
  ],
  Atmosphere: [
    "atmosphere", "ambiance", "music", "decor", "vibe", "cozy", "view",
    "romantic", "terrace", "beautiful", "elegant", "intimate", "spot",
    "setting", "evening",
  ],
  Value: [
    "price", "value", "worth", "expensive", "cheap", "portion", "bill",
    "overpriced", "affordable",
  ],
};

const POSITIVE_WORDS = new Set([
  "great", "excellent", "amazing", "perfect", "wonderful", "fantastic",
  "outstanding", "best", "love", "loved", "incredible", "superb",
  "delicious", "fresh", "friendly", "beautiful", "cozy", "authentic",
  "impeccable", "recommend", "definitely", "good", "nice", "lovely",
  "creative", "solid", "well", "spot",
]);

const NEGATIVE_WORDS = new Set([
  "bad", "terrible", "awful", "worst", "horrible", "disgusting", "rude",
  "cold", "slow", "disappointing", "overpriced", "mediocre", "bland",
  "nothing", "unfortunately", "long",
]);

const DIMENSION_ICONS: Record<string, string> = {
  Food: "\uD83C\uDF7D\uFE0F",
  Service: "\uD83E\uDD1D",
  Atmosphere: "\u2728",
  Value: "\uD83D\uDCB0",
};

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "was", "were", "are", "be",
  "been", "to", "of", "in", "for", "on", "at", "it", "we", "i", "he", "she",
  "they", "my", "our", "us", "me", "you", "your", "its", "this", "that",
  "with", "from", "as", "by", "so", "if", "no", "not", "up", "out", "had",
  "has", "have", "do", "did", "will", "would", "could", "should", "can",
  "may", "very", "too", "also", "just", "about",
]);

const BEST_FOR_TAGS: Record<string, string[]> = {
  "Date night": ["date", "romantic", "couple", "anniversary"],
  "Groups": ["friend", "group", "party"],
  "Business": ["business", "meeting", "professional"],
  "Families": ["family", "kid", "child", "children"],
  "Terrace dining": ["terrace", "outdoor", "garden", "outside"],
  "Live music": ["music", "live", "band"],
};

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s'-]/g, "").split(/\s+/).filter(Boolean);
}

function computeDimensions(reviews: Review[]): ReviewIntelligence["dimensions"] {
  const counts: Record<string, { positive: number; negative: number }> = {};

  for (const dim of Object.keys(DIMENSION_KEYWORDS)) {
    counts[dim] = { positive: 0, negative: 0 };
  }

  for (const review of reviews) {
    const text = review.text.toLowerCase();
    if (!text) continue;
    const words = new Set(tokenize(review.text));

    for (const [dim, keywords] of Object.entries(DIMENSION_KEYWORDS)) {
      const hasDimKeyword = keywords.some((kw) => text.includes(kw));
      if (!hasDimKeyword) continue;

      const hasPositive = [...words].some((w) => POSITIVE_WORDS.has(w));
      const hasNegative = [...words].some((w) => NEGATIVE_WORDS.has(w));

      if (hasPositive) counts[dim].positive++;
      if (hasNegative) counts[dim].negative++;
    }
  }

  const dimensions: ReviewIntelligence["dimensions"] = [];

  for (const [dim, { positive, negative }] of Object.entries(counts)) {
    const total = positive + negative;
    if (total < 3) continue;
    dimensions.push({
      label: dim,
      icon: DIMENSION_ICONS[dim],
      percent: Math.round((positive / total) * 100),
      mentionCount: total,
    });
  }

  return dimensions;
}

function computeTopMentions(reviews: Review[]): ReviewIntelligence["topMentions"] {
  const bigramCounts = new Map<string, number>();

  for (const review of reviews) {
    if (!review.text) continue;
    const words = tokenize(review.text);
    const seenInReview = new Set<string>();

    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (!seenInReview.has(bigram)) {
        seenInReview.add(bigram);
        bigramCounts.set(bigram, (bigramCounts.get(bigram) ?? 0) + 1);
      }
    }
  }

  return Array.from(bigramCounts.entries())
    .filter(([phrase, count]) => {
      if (count < 2) return false;
      const parts = phrase.split(" ");
      return !parts.every((p) => STOP_WORDS.has(p));
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase, count]) => ({ phrase, count }));
}

function computeBestFor(reviews: Review[]): string[] {
  const tags: string[] = [];

  for (const [tag, keywords] of Object.entries(BEST_FOR_TAGS)) {
    let matchCount = 0;
    for (const review of reviews) {
      const text = review.text.toLowerCase();
      if (keywords.some((kw) => text.includes(kw))) {
        matchCount++;
      }
    }
    if (matchCount >= 2) {
      tags.push(tag);
    }
  }

  return tags.slice(0, 4);
}

function computeTrend(reviews: Review[]): "up" | "down" | "stable" {
  if (reviews.length < 2) return "stable";

  const mid = Math.floor(reviews.length / 2);
  const firstHalf = reviews.slice(0, mid);
  const secondHalf = reviews.slice(mid);

  const avgFirst = firstHalf.reduce((s, r) => s + r.rating, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, r) => s + r.rating, 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;
  if (diff > 0.2) return "up";
  if (diff < -0.2) return "down";
  return "stable";
}

export function processReviews(reviews: Review[]): ReviewIntelligence | null {
  if (reviews.length < 5) return null;

  return {
    dimensions: computeDimensions(reviews),
    topMentions: computeTopMentions(reviews),
    bestFor: computeBestFor(reviews),
  };
}
