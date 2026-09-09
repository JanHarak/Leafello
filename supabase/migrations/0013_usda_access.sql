-- 0013_usda_access.sql
-- Zpřístupnění USDA potravin ke čtení všem přihlášeným a idempotentní klíč pro
-- import. Zápis referenčních zdrojů (off/curated/usda) smí jen service role;
-- běžný uživatel smí zakládat/upravovat výhradně vlastní potraviny ('user'/'ai')
-- – politiku proto zpřísňujeme z „not in (...)“ na explicitní allowlist, aby ji
-- žádný budoucí referenční zdroj nemohl obejít.

drop policy foods_read on foods;
create policy foods_read on foods for select to authenticated
  using (source in ('off', 'curated', 'usda') or created_by = auth.uid());

drop policy food_servings_read on food_servings;
create policy food_servings_read on food_servings for select to authenticated
  using (
    exists (
      select 1 from foods f
      where f.id = food_id
        and (f.source in ('off', 'curated', 'usda') or f.created_by = auth.uid())
    )
  );

drop policy foods_insert on foods;
create policy foods_insert on foods for insert to authenticated
  with check (created_by = auth.uid() and source in ('user', 'ai'));

drop policy foods_update on foods;
create policy foods_update on foods for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and source in ('user', 'ai'));

create unique index if not exists foods_usda_extid_idx
  on foods (external_id) where source = 'usda' and external_id is not null;
