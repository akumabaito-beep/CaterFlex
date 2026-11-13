-- Adds more allergen types the panel asked for. Safe to run more than once.
insert into "ALLERGY_TAG" ("AllergenName")
select v from (values ('fish'),('tree_nuts'),('sesame'),('sulfites'),('corn'),('mustard')) as t(v)
where not exists (select 1 from "ALLERGY_TAG" a where lower(a."AllergenName") = t.v);
