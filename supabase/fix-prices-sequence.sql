-- The PRICES PriceID sequence lagged behind existing rows, so new inserts
-- reused IDs and hit PRICES_pkey. Run once in the Supabase SQL editor.
SELECT setval(
  pg_get_serial_sequence('"PRICES"', 'PriceID'),
  COALESCE((SELECT MAX("PriceID") FROM public."PRICES"), 1)
);
