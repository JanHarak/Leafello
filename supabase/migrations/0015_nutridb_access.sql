-- 0015_nutridb_access.sql
-- Zpřístupnění NutriDatabáze potravin ke čtení všem přihlášeným a idempotentní
-- klíč pro import. Zápis zůstává jen pro service role (import skript); běžný
-- uživatel dál smí psát jen 'user'/'ai' (politika z 0013 se nemění).

drop policy foods_read on foods;
create policy foods_read on foods for select to authenticated
  using (source in ('off', 'curated', 'usda', 'nidb') or created_by = auth.uid());

drop policy food_servings_read on food_servings;
create policy food_servings_read on food_servings for select to authenticated
  using (
    exists (
      select 1 from foods f
      where f.id = food_id
        and (f.source in ('off', 'curated', 'usda', 'nidb') or f.created_by = auth.uid())
    )
  );

create unique index if not exists foods_nidb_extid_idx
  on foods (external_id) where source = 'nidb' and external_id is not null;
