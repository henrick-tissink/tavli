-- 0046_prospect_waitlist_retention.sql
-- audit #5 — the §15 pre-launch wait-list (prospect_waitlist) held email +
-- source_ip with no retention coverage. The DSR erasure handler
-- (handleProspectWaitlist) covers subjects who are also diners; this policy
-- is the wholesale time-based purge of wait-list PII so un-converted
-- prospects don't linger indefinitely.
--
-- hard_delete on joined_at: a wait-list email older than 730 days is purged
-- regardless of conversion. Invitation/organization records persist
-- independently of the wait-list row, so this loses no operational data.

INSERT INTO "retention_policies" (scope_table, retention_period_days, action_on_expiry, applies_to_column, exception_predicate, notes) VALUES
  ('prospect_waitlist', 730, 'hard_delete', 'joined_at', NULL,
    'audit #5 — GDPR minimisation of the pre-launch wait-list (email + source_ip)')
ON CONFLICT (scope_table) DO NOTHING;
