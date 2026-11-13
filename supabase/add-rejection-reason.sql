-- Lets the caterer say why a booking was rejected. Run once in the Supabase SQL editor.
alter table "BOOKING" add column if not exists "RejectionReason" text;
