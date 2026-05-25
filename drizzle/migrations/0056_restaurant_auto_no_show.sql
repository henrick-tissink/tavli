-- 0056_restaurant_auto_no_show
-- §02 §6 + §08 §10 — opt-in auto-mark-no-show. Per the §02 open-question
-- recommendation it defaults OFF (some venues accept late arrivals; auto-marking
-- would corrupt their no-show data), opt-in per venue. The auto-no-show sweep
-- only touches venues with this set true.
--
-- Additive boolean, default false. Safe to apply ahead of code.

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "auto_no_show" boolean NOT NULL DEFAULT false;
