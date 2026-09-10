-- 0017_coach.sql
-- AI kouč: cache posledního týdenního přehledu na uživatele a přepínač
-- automatického týdenního generování (cron). Přehled generuje edge funkce
-- `weekly-coach`; tady jen úložiště a preference.

-- Poslední vygenerovaný týdenní přehled (jeden řádek na uživatele, upsert).
create table coach_summaries (
  user_id      uuid primary key references auth.users on delete cascade,
  period_start date not null,
  period_end   date not null,
  summary      jsonb not null,
  created_at   timestamptz not null default now()
);

alter table coach_summaries enable row level security;
create policy coach_own on coach_summaries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Přepínač automatického týdenního přehledu (cron generuje jen opt-in uživatelům).
alter table profiles
  add column coach_weekly boolean not null default false;
