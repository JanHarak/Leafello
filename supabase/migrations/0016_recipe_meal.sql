-- 0016_recipe_meal.sql
-- Fáze dne u receptu (snídaně/oběd/večeře/svačina), aby šly recepty seskupit
-- a olabelovat. Nullable – existující recepty i ručně vytvořené bez volby fáze
-- spadnou do skupiny „Ostatní".
alter table recipes
  add column meal text check (meal is null or meal in ('breakfast', 'lunch', 'dinner', 'snack'));
