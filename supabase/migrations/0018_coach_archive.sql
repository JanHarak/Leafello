-- 0018_coach_archive.sql
-- AI kouč: archiv výstupů. Původně byl jeden přehled na uživatele (PK user_id);
-- teď chceme historii (víc přehledů, mazatelných). Přidáme vlastní id jako PK,
-- user_id zůstává jako (neunikátní) cizí klíč. RLS policy `coach_own` (user_id =
-- auth.uid()) platí dál pro všechny řádky.

alter table coach_summaries drop constraint coach_summaries_pkey;
alter table coach_summaries add column id uuid not null default gen_random_uuid();
alter table coach_summaries add constraint coach_summaries_pkey primary key (id);

create index coach_summaries_user_idx on coach_summaries (user_id, created_at desc);
