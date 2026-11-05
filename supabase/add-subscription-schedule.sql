-- Subscription by plan length + delivery days, pause tracking and cancellation refunds.
-- Run once in the Supabase SQL editor BEFORE deploying the code.
-- (Run add-meal-plan-subscription.sql first if you have not already.)
alter table if exists public."MEAL_PREP_ORDER"
  add column if not exists "PlanWeeks"    integer,             -- 1, 2 or 4 weeks per term
  add column if not exists "DeliveryDays" text,                -- weekday numbers, 0 = Sunday ... 6 = Saturday, e.g. '1,2,3,4,5'
  add column if not exists "PausedFrom"   date,
  add column if not exists "PausedUntil"  date,                -- customer's planned return date (at most 14 days out)
  add column if not exists "PausedDays"   integer not null default 0,
  add column if not exists "RefundAmount" numeric(10,2),       -- calculated when the plan is cancelled
  add column if not exists "CancelledAt"  date;
