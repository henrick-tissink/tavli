-- 0068_marketing_sends_org_sent
-- Marketing analytics: the partner Marketing page computes the current-month
-- open rate with an aggregate over marketing_sends filtered by
-- (organization_id, sent_at >= date_trunc('month', now())). The table only had
-- campaign / diner / resend / twilio indexes, so that query was a per-org
-- filtered scan whose cost grows with total send volume. Add a composite index
-- to support it (and any org + time-window send analytics).
--
-- Additive, safe to apply ahead of code.

CREATE INDEX IF NOT EXISTS "marketing_sends_org_sent"
  ON "marketing_sends" ("organization_id", "sent_at" DESC);
