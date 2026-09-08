-- 0005_food_search_word_similarity.sql
-- Lepší české hledání (F-04) bez dostupného stemmeru: kombinuje
--   1) prefixový full-text (píšeš začátek slova: "jogur" → "jogurt"),
--   2) word_similarity/<% (zvládne koncovky a překlepy: "ryze" → "rýžové",
--      "rizek" → "řízek"), práh 0.5 změřen jako dobrý poměr zásah/šum.
-- Vše bez ohledu na diakritiku přes f_unaccent z migrace 0004.

create or replace function search_foods(q text, lim int default 20)
returns setof foods
language sql stable
set pg_trgm.word_similarity_threshold = 0.5
as $$
  with norm as (
    select f_unaccent(lower(coalesce(q, ''))) as nq
  ),
  pref as (
    select nullif(string_agg(tok || ':*', ' & '), '') as tsq
    from norm,
         unnest(string_to_array(regexp_replace(norm.nq, '[^a-z0-9 ]', ' ', 'g'), ' ')) as tok
    where tok <> ''
  )
  select f.*
  from foods f, norm, pref
  where
    (pref.tsq is not null and f.search_tsv @@ to_tsquery('simple', pref.tsq))
    or f_unaccent(f.name) ilike '%' || norm.nq || '%'
    or norm.nq <% f_unaccent(f.name)
  order by
    (f_unaccent(lower(f.name)) = norm.nq) desc,
    (f_unaccent(f.name) ilike norm.nq || '%') desc,
    f.is_verified desc,
    word_similarity(norm.nq, f_unaccent(f.name)) desc,
    f.name asc
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;
