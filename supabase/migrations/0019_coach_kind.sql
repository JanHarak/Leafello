-- 0019_coach_kind.sql
-- AI kouč: dva druhy přehledů. Dosud existoval jen týdenní; přidáváme denní
-- (ruční, jen pro daný den). Sloupec `kind` je rozlišuje. Stávající řádky jsou
-- týdenní (default 'weekly'). Archiv se v aplikaci filtruje podle `kind`.

alter table coach_summaries add column kind text not null default 'weekly'
  check (kind in ('daily', 'weekly'));

-- Index pro výpis archivu daného druhu, od nejnovějšího.
drop index if exists coach_summaries_user_idx;
create index coach_summaries_user_kind_idx on coach_summaries (user_id, kind, created_at desc);
