-- 0012_usda_source.sql
-- Generické potraviny z USDA FoodData Central (public domain) mají vlastní
-- zdroj 'usda'. ADD VALUE stojí samostatně (nová enum hodnota nesmí být použita
-- ve stejné transakci) – použije se až v migraci 0013.
alter type food_source_t add value if not exists 'usda';
