-- Register restaurant_view_events (0062) with the nightly retention purge.
-- The only reader (partner overview stats) counts a rolling 7-day window;
-- without a policy the append-only table grows unboundedly. 90 days keeps
-- headroom for future trend charts while bounding storage. Rows carry no
-- user identifier, so this is hygiene rather than GDPR-driven.

INSERT INTO "retention_policies" (scope_table, retention_period_days, action_on_expiry, applies_to_column, exception_predicate, notes) VALUES
  ('restaurant_view_events', 90, 'hard_delete', 'occurred_at', NULL,
    'telemetry hygiene — only the trailing 7 days are read (overview stats); 90d retained for future trends')
ON CONFLICT (scope_table) DO NOTHING;
