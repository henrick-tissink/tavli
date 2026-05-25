-- 0057_diner_processing_restricted
-- §13 §6.6 / GDPR Art 18 — restriction of processing. The restrict_processing
-- DSR flags the diner here: marketing excludes them, operator writes fail
-- TV1104, but reservations still process (Art 18(2): storage permitted for the
-- establishment/exercise/defence of legal claims). 'object' to direct marketing
-- is handled as a full unsubscribe via marketing_suppressions, not this flag.
--
-- Additive boolean, default false. Safe to apply ahead of code.

ALTER TABLE "diners" ADD COLUMN IF NOT EXISTS "processing_restricted" boolean NOT NULL DEFAULT false;
