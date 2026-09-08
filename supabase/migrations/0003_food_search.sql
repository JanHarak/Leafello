-- 0003_food_search.sql
-- Vyhledávání potravin (F-04): plní se sloupec search_tsv a přidává RPC
-- search_foods s full-textem a fuzzy fallbackem přes pg_trgm.
--
-- Pozn.: PostgreSQL nemá vestavěnou konfiguraci 'czech', proto se používá
-- 'simple' (bez stematizace, jen tokenizace a malá písmena). Morfologii
-- (pády, koncovky) dorovnává trigramový fallback. Migrace se přidává jako
-- nový soubor, existující se nemění.

-- ─── Údržba search_tsv triggerem ──────────────────────────────────────────
create or replace function foods_search_tsv_update() returns trigger
language plpgsql as $$
begin
  new.search_tsv := to_tsvector(
    'simple',
    coalesce(new.name, '') || ' ' || coalesce(new.brand, '')
  );
  return new;
end;
$$;

create trigger foods_search_tsv_trg
  before insert or update of name, brand on foods
  for each row execute function foods_search_tsv_update();

-- Doplnění pro případné existující řádky.
update foods
   set search_tsv = to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(brand, ''));

-- ─── RPC vyhledávání ──────────────────────────────────────────────────────
-- security invoker (výchozí): platí RLS volajícího, tj. vrátí jen potraviny
-- se source='off' nebo vlastní (created_by = auth.uid()).
-- Řazení podle F-04: přesná shoda → prefix → verifikované → podobnost názvu.
create or replace function search_foods(q text, lim int default 20)
returns setof foods
language sql stable as $$
  select f.*
  from foods f
  where
    f.search_tsv @@ websearch_to_tsquery('simple', q)
    or f.name ilike '%' || q || '%'
    or f.name % q
  order by
    (lower(f.name) = lower(q)) desc,
    (f.name ilike q || '%') desc,
    f.is_verified desc,
    similarity(f.name, q) desc,
    f.name asc
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;
