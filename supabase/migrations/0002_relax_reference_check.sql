-- 0002_relax_reference_check.sql
-- Uvolnění constraintu num_nonnulls(food_id, recipe_id) = 1 na <= 1
-- u diary_entries a meal_plan_items.
--
-- Důvod: obě tabulky mají food_id i recipe_id s `on delete set null`.
-- Když se smaže odkazovaná potravina (nebo recept), reference se nastaví
-- na NULL a při původním `= 1` by úprava selhala – smazání zdroje by
-- neprošlo. To je v rozporu s testem T-59, který vyžaduje, aby záznam
-- v deníku smazání potraviny přežil a zůstal čitelný ze `snapshot`.
--
-- Snapshot je zdroj pravdy, takže záznam bez reference je validní a plně
-- čitelný. Pravidlo „právě jedna reference" při zápisu vynucuje aplikace;
-- databáze nově povoluje i stav bez reference (po smazání zdroje).

alter table diary_entries drop constraint diary_entries_check;
alter table diary_entries
  add constraint diary_entries_check check (num_nonnulls(food_id, recipe_id) <= 1);

alter table meal_plan_items drop constraint meal_plan_items_check;
alter table meal_plan_items
  add constraint meal_plan_items_check check (num_nonnulls(food_id, recipe_id) <= 1);
