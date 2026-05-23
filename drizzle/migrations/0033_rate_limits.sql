-- Wave 4 sub-unit C §13 §4.4 — rate_limits table
-- Service-role only. No RLS policies — bare minimum (DROP ALL → ENABLE).

CREATE TABLE "rate_limits" (
  "key" varchar(200) NOT NULL,
  "scope" varchar(60) NOT NULL,
  "window_start" timestamptz NOT NULL,
  "window_end" timestamptz NOT NULL,
  "count" integer NOT NULL DEFAULT 1,
  "expires_at" timestamptz NOT NULL,
  PRIMARY KEY ("key", "window_start")
);

CREATE INDEX "rate_limits_expires" ON "rate_limits" ("expires_at");

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
