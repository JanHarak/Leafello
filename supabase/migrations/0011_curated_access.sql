-- 0011_curated_access.sql
-- Zpřístupnění kurátorských potravin (source='curated') všem přihlášeným ke
-- čtení – jsou to sdílená referenční data jako OFF. Zápis kurátorských i OFF
-- dat smí jen service role (seed/import skripty přes přímé DB spojení), nikoliv
-- běžný uživatel – jinak by si mohl podstrčit „ověřenou" potravinu viditelnou
-- všem. Přidává se i idempotentní klíč pro import (external_id).

-- Čtení: OFF + curated jsou globální, plus vlastní záznamy uživatele.
drop policy foods_read on foods;
create policy foods_read on foods for select to authenticated
  using (source in ('off', 'curated') or created_by = auth.uid());

drop policy food_servings_read on food_servings;
create policy food_servings_read on food_servings for select to authenticated
  using (
    exists (
      select 1 from foods f
      where f.id = food_id
        and (f.source in ('off', 'curated') or f.created_by = auth.uid())
    )
  );

-- Zápis: uživatel smí zakládat/upravovat jen vlastní (source 'user'/'ai'),
-- nikdy 'off' ani 'curated'. Ta se plní výhradně service rolí mimo RLS.
drop policy foods_insert on foods;
create policy foods_insert on foods for insert to authenticated
  with check (created_by = auth.uid() and source not in ('off', 'curated'));

drop policy foods_update on foods;
create policy foods_update on foods for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and source not in ('off', 'curated'));

-- Idempotence importu kurátorských dat: stabilní slug v external_id.
create unique index if not exists foods_curated_extid_idx
  on foods (external_id) where source = 'curated' and external_id is not null;
