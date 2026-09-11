-- 0020_push_subscriptions.sql
-- Web push: odběry prohlížečů/zařízení pro připomínky. Jeden řádek na
-- prohlížeč (endpoint unikátní). Vlastní řádky vidí/spravuje uživatel; odesílač
-- (service-role) čte napříč uživateli.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_own on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index push_subscriptions_user_idx on push_subscriptions (user_id);
