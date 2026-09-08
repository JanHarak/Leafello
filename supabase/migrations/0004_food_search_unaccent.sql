-- 0004_food_search_unaccent.sql
-- Vyhledávání potravin bez ohledu na diakritiku (F-04): 'ryze' najde 'rýžové'.
-- Přidává rozšíření unaccent, immutable wrapper (aby šel použít v indexu),
-- přepočítává search_tsv přes unaccent a rozšiřuje RPC search_foods.

create extension if not exists unaccent with schema public;

-- unaccent(text) je jen STABLE; obalíme ho jako IMMUTABLE (slovník je pevný),
-- aby šel použít ve výrazovém indexu i v generovaném tsvectoru. Schéma je
-- kvalifikované, aby nezáleželo na search_path volajícího.
create or replace function f_unaccent(text) returns text
  language sql immutable strict parallel safe as $$
  select public.unaccent($1)
$$;

-- search_tsv nově bez diakritiky.
create or replace function foods_search_tsv_update() returns trigger
language plpgsql as $$
begin
  new.search_tsv := to_tsvector(
    'simple',
    f_unaccent(coalesce(new.name, '') || ' ' || coalesce(new.brand, ''))
  );
  return new;
end;
$$;

update foods
   set search_tsv = to_tsvector('simple', f_unaccent(coalesce(name, '') || ' ' || coalesce(brand, '')));

-- Trigramový index nad názvem bez diakritiky (pro fuzzy fallback F-04 při 500k).
create index if not exists foods_unaccent_trgm_idx
  on foods using gin (f_unaccent(name) gin_trgm_ops);

-- RPC porovnává obě strany bez diakritiky.
create or replace function search_foods(q text, lim int default 20)
returns setof foods
language sql stable as $$
  select f.*
  from foods f
  where
    f.search_tsv @@ websearch_to_tsquery('simple', f_unaccent(q))
    or f_unaccent(f.name) ilike '%' || f_unaccent(q) || '%'
    or f_unaccent(f.name) % f_unaccent(q)
  order by
    (f_unaccent(lower(f.name)) = f_unaccent(lower(q))) desc,
    (f_unaccent(f.name) ilike f_unaccent(q) || '%') desc,
    f.is_verified desc,
    similarity(f_unaccent(f.name), f_unaccent(q)) desc,
    f.name asc
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;
