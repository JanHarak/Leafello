-- 0006_reminder_email.sql
-- E-mailové připomínky (F-13, web): preference uživatele a log odeslání
-- (idempotence, aby se stejná připomínka neposlala dvakrát za den).
-- Obě tabulky mají RLS (pravidlo „žádná tabulka bez RLS", test T-47).

create table reminder_prefs (
  user_id         uuid primary key references auth.users on delete cascade,
  email           text,
  email_reminders boolean not null default false,
  updated_at      timestamptz not null default now()
);
alter table reminder_prefs enable row level security;
create policy reminder_prefs_own on reminder_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table reminder_sends (
  user_id    uuid not null references auth.users on delete cascade,
  slot       text not null,
  sent_on    date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (user_id, slot, sent_on)
);
alter table reminder_sends enable row level security;
-- Zápis dělá jen service role (Edge Function), čtení smí vlastník.
create policy reminder_sends_own on reminder_sends for select to authenticated
  using (user_id = auth.uid());
