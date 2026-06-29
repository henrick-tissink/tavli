-- 0069_marketing_send_status_sending
-- Adds the in-flight 'sending' state to marketing_send_status.
--
-- Two reasons:
--   1. The per-recipient policy's frequency-cap query (send/policy.ts) already
--      counts `status IN ('queued','sending',...)`. 'sending' was never a label
--      on the enum, so that query errored against Postgres — a latent break in
--      every marketing send. This adds the missing label.
--   2. The leaf sender now atomically CLAIMS a send row (queued → sending)
--      BEFORE calling the provider, so a pg-boss retry after a successful
--      provider call can't re-send (the retry no longer sees a 'queued' row).
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block and the new
-- label cannot be used in the same transaction it is added — so this lives in
-- its own migration, applied via `psql -f` (autocommit), ahead of the code that
-- uses it. Additive and safe to apply early.

ALTER TYPE "marketing_send_status" ADD VALUE IF NOT EXISTS 'sending';
