-- 0014_nutridb_source.sql
-- Generické potraviny z NutriDatabáze.cz (ÚZEI, česká databáze složení
-- potravin) mají vlastní zdroj 'nidb'. Data se používají z oficiálního
-- registrovaného exportu v souladu s licencí NutriDatabaze.cz; atribuce je
-- v aplikaci povinná. ADD VALUE stojí samostatně (použije se až v 0015).
alter type food_source_t add value if not exists 'nidb';
