-- Meal plans as subscriptions. Run once in the Supabase SQL editor BEFORE deploying the code.
alter table if exists public."MEAL_PREP_ORDER"
  add column if not exists "MealType"          text,               -- breakfast | lunch | dinner
  add column if not exists "TermCycles"        integer,            -- deliveries bought in the current term
  add column if not exists "TermEndDate"       date,               -- date of the last delivery in the term
  add column if not exists "RenewedCount"      integer not null default 0,
  add column if not exists "FulfillmentMethod" text not null default 'pickup', -- pickup | delivery
  add column if not exists "FulfillmentTime"   text,               -- HH:MM
  add column if not exists "DeliveryAddress"   text,
  add column if not exists "DeliveryFee"       numeric(10,2) not null default 0, -- per delivery
  add column if not exists "PricePerServing"   numeric(10,2),      -- price LOCKED when the plan was ordered
  add column if not exists "SkippedCount"      integer not null default 0;
