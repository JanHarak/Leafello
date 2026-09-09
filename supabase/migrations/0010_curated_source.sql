-- 0010_curated_source.sql
-- Kurátorská generická data (české suroviny) mají vlastní zdroj 'curated'.
-- ADD VALUE u enumu musí být commitnuté DŘÍV, než se hodnota použije v dalších
-- příkazech (Postgres nedovolí použít novou enum hodnotu ve stejné transakci),
-- proto stojí samostatně. Navazující migrace 0011 hodnotu teprve použije.
alter type food_source_t add value if not exists 'curated';
