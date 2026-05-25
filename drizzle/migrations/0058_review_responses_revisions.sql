-- 0058_review_responses_revisions
-- §06 §3.1a + §3.2 — owner responses + review edit history.
--   review_responses: one owner response per review (review_id PK = 1:1).
--   review_revisions: append-only snapshot of a review's body before each edit.
-- reviews has no `locale` column (single-locale RO model), so prior_locale
-- defaults to 'ro'. Additive tables only. Safe to apply ahead of code.

CREATE TABLE IF NOT EXISTS "review_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "review_id" uuid NOT NULL REFERENCES "reviews"("id") ON DELETE CASCADE,
  "revision" smallint NOT NULL,
  "prior_body" text,
  "prior_rating" smallint NOT NULL,
  "prior_locale" char(2) NOT NULL DEFAULT 'ro',
  "edited_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("review_id", "revision")
);
CREATE INDEX IF NOT EXISTS "review_revisions_review" ON "review_revisions" ("review_id", "revision" DESC);

CREATE TABLE IF NOT EXISTS "review_responses" (
  "review_id" uuid PRIMARY KEY REFERENCES "reviews"("id") ON DELETE CASCADE,
  "restaurant_id" uuid NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "responder_user_id" uuid NOT NULL REFERENCES "auth"."users"("id"),
  "body" text NOT NULL,
  "locale" char(2) NOT NULL DEFAULT 'ro',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "review_responses_restaurant" ON "review_responses" ("restaurant_id", "created_at" DESC);

ALTER TABLE "review_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "review_responses" ENABLE ROW LEVEL SECURITY;
-- Public can read owner responses (rendered on the venue page); writes are
-- service-role only (via the gated server actions).
CREATE POLICY "review_responses_public_read" ON "review_responses" FOR SELECT USING (true);
