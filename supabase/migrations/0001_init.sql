-- 0001_init.sql
-- Počáteční schéma podle docs/zadani.md, sekce 4 a 4.1.
-- Pravidlo projektu: ŽÁDNÁ tabulka bez RLS. Každá tabulka níže má zapnuté
-- RLS a alespoň jednu politiku (kontroluje test T-47).
-- Migrace se spouští proti čisté databázi. Existující migrace se nemění,
-- další změny se přidávají jako nový číslovaný soubor.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ─── Enumy ────────────────────────────────────────────────────────────────
create type sex_t         as enum ('male','female');
create type activity_t    as enum ('sedentary','light','moderate','high','very_high');
create type meal_t        as enum ('breakfast','lunch','dinner','snack');
create type food_source_t as enum ('off','user','ai');
create type reminder_t    as enum ('meal','water','weigh_in','weekly_summary');
create type mood_t        as enum ('happy','hungry','thirsty','sleepy','celebrating');

-- ─── Tabulky (v pořadí závislostí) ────────────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  sex           sex_t not null,
  birth_date    date not null,
  height_cm     numeric(5,1) not null check (height_cm between 100 and 250),
  activity      activity_t not null,
  locale        text not null default 'cs',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  start_date        date not null default current_date,
  target_weight_kg  numeric(5,1) not null,
  rate_kg_per_week  numeric(3,2) not null check (rate_kg_per_week between 0 and 1),
  kcal_target       int not null check (kcal_target >= 1200),
  protein_g         int not null,
  carbs_g           int not null,
  fat_g             int not null,
  water_ml          int not null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);
create unique index goals_one_active on goals (user_id) where is_active;

create table weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  logged_on  date not null default current_date,
  weight_kg  numeric(5,2) not null check (weight_kg between 25 and 400),
  unique (user_id, logged_on)
);

create table foods (
  id            uuid primary key default gen_random_uuid(),
  source        food_source_t not null,
  external_id   text,
  barcode       text,
  name          text not null,
  brand         text,
  kcal_100g     numeric(6,1) not null check (kcal_100g between 0 and 900),
  protein_100g  numeric(5,1) not null default 0,
  carbs_100g    numeric(5,1) not null default 0,
  fat_100g      numeric(5,1) not null default 0,
  fiber_100g    numeric(5,1),
  sugar_100g    numeric(5,1),
  salt_100g     numeric(5,2),
  is_verified   boolean not null default false,
  created_by    uuid references auth.users on delete set null,
  search_tsv    tsvector,
  created_at    timestamptz not null default now()
);
create index foods_tsv_idx  on foods using gin (search_tsv);
create index foods_trgm_idx on foods using gin (name gin_trgm_ops);
create unique index foods_barcode_off_idx on foods (barcode) where source = 'off' and barcode is not null;

create table food_servings (
  id         uuid primary key default gen_random_uuid(),
  food_id    uuid not null references foods on delete cascade,
  label      text not null,
  grams      numeric(6,1) not null check (grams > 0),
  is_default boolean not null default false
);

create table recipes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users on delete cascade,
  name         text not null,
  servings     int not null check (servings > 0),
  instructions text,
  source       food_source_t not null default 'user',
  is_public    boolean not null default false
);

create table recipe_ingredients (
  id        uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes on delete cascade,
  food_id   uuid not null references foods on delete restrict,
  grams     numeric(7,1) not null check (grams > 0)
);

create table photo_analyses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  storage_path text not null,
  model        text not null,
  raw_response jsonb,
  status       text not null default 'pending',
  created_at   timestamptz not null default now()
);

create table diary_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  entry_date         date not null default current_date,
  meal               meal_t not null,
  food_id            uuid references foods on delete set null,
  recipe_id          uuid references recipes on delete set null,
  grams              numeric(7,1) check (grams > 0),
  servings           numeric(4,2),
  snapshot           jsonb not null,
  photo_analysis_id  uuid references photo_analyses on delete set null,
  created_at         timestamptz not null default now(),
  check (num_nonnulls(food_id, recipe_id) = 1)
);
create index diary_user_date on diary_entries (user_id, entry_date);

create table water_logs (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users on delete cascade,
  logged_at timestamptz not null default now(),
  ml        int not null check (ml between 1 and 3000)
);

create table meal_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  start_date date not null,
  end_date   date not null,
  check (end_date >= start_date)
);

create table meal_plan_items (
  id           uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references meal_plans on delete cascade,
  plan_date    date not null,
  meal         meal_t not null,
  food_id      uuid references foods on delete set null,
  recipe_id    uuid references recipes on delete set null,
  grams        numeric(7,1),
  servings     numeric(4,2),
  check (num_nonnulls(food_id, recipe_id) = 1)
);

create table reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  type         reminder_t not null,
  time_of_day  time not null,
  days_of_week int[] not null default '{1,2,3,4,5,6,7}',
  enabled      boolean not null default true,
  payload      jsonb
);

create table avatar_state (
  user_id           uuid primary key references auth.users on delete cascade,
  level             int not null default 0,
  xp                int not null default 0,
  streak_days       int not null default 0,
  streak_saves_left int not null default 1,
  streak_month      date,
  last_active_on    date,
  mood              mood_t not null default 'happy',
  unlocked          jsonb not null default '[]'
);

create table achievements (
  code        text primary key,
  name        text not null,
  description text not null,
  xp_reward   int not null default 0,
  rule        jsonb not null
);

create table user_achievements (
  user_id            uuid not null references auth.users on delete cascade,
  achievement_code   text not null references achievements,
  earned_at          timestamptz not null default now(),
  primary key (user_id, achievement_code)
);

-- ─── Pohled na denní součty ───────────────────────────────────────────────
-- security_invoker = RLS deníku platí i skrz pohled pro dotazujícího uživatele.
create view v_daily_totals with (security_invoker = true) as
select
  user_id,
  entry_date,
  round(sum((snapshot->>'kcal')::numeric))    as kcal,
  round(sum((snapshot->>'protein')::numeric)) as protein_g,
  round(sum((snapshot->>'carbs')::numeric))   as carbs_g,
  round(sum((snapshot->>'fat')::numeric))     as fat_g,
  count(*)                                    as entries
from diary_entries
group by user_id, entry_date;

-- ─── RLS ──────────────────────────────────────────────────────────────────
alter table profiles           enable row level security;
alter table goals              enable row level security;
alter table weight_logs        enable row level security;
alter table foods              enable row level security;
alter table food_servings      enable row level security;
alter table recipes            enable row level security;
alter table recipe_ingredients enable row level security;
alter table photo_analyses     enable row level security;
alter table diary_entries      enable row level security;
alter table water_logs         enable row level security;
alter table meal_plans         enable row level security;
alter table meal_plan_items    enable row level security;
alter table reminders          enable row level security;
alter table avatar_state       enable row level security;
alter table achievements       enable row level security;
alter table user_achievements  enable row level security;

-- profiles: jen vlastní řádek (klíč id)
create policy profiles_own on profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Tabulky vázané na user_id: čtení i zápis jen vlastní
create policy goals_own on goals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy weight_logs_own on weight_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy diary_own on diary_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy water_own on water_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy meal_plans_own on meal_plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy photo_own on photo_analyses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminders_own on reminders for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy avatar_own on avatar_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_ach_own on user_achievements for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- meal_plan_items: dědí podle nadřazeného plánu
create policy meal_plan_items_read on meal_plan_items for select to authenticated
  using (exists (select 1 from meal_plans p where p.id = meal_plan_id and p.user_id = auth.uid()));
create policy meal_plan_items_write on meal_plan_items for all to authenticated
  using (exists (select 1 from meal_plans p where p.id = meal_plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from meal_plans p where p.id = meal_plan_id and p.user_id = auth.uid()));

-- foods: čtení off nebo vlastní; zápis jen vlastní a source <> 'off'
create policy foods_read on foods for select to authenticated
  using (source = 'off' or created_by = auth.uid());
create policy foods_insert on foods for insert to authenticated
  with check (created_by = auth.uid() and source <> 'off');
create policy foods_update on foods for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and source <> 'off');
create policy foods_delete on foods for delete to authenticated
  using (created_by = auth.uid());

-- food_servings: dědí podle nadřazené potraviny
create policy food_servings_read on food_servings for select to authenticated
  using (exists (select 1 from foods f where f.id = food_id
                 and (f.source = 'off' or f.created_by = auth.uid())));
create policy food_servings_write on food_servings for all to authenticated
  using (exists (select 1 from foods f where f.id = food_id and f.created_by = auth.uid()))
  with check (exists (select 1 from foods f where f.id = food_id and f.created_by = auth.uid()));

-- recipes: čtení vlastní nebo veřejné, zápis jen vlastní
create policy recipes_read on recipes for select to authenticated
  using (owner_id = auth.uid() or is_public);
create policy recipes_write on recipes for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- recipe_ingredients: dědí podle receptu
create policy recipe_ing_read on recipe_ingredients for select to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id
                 and (r.owner_id = auth.uid() or r.is_public)));
create policy recipe_ing_write on recipe_ingredients for all to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from recipes r where r.id = recipe_id and r.owner_id = auth.uid()));

-- achievements: čtení pro přihlášené, zápis jen service role (bez politiky = jen bypass)
create policy achievements_read on achievements for select to authenticated
  using (true);

-- ─── Storage: bucket meal-photos, privátní, přístup jen k vlastní cestě ────
insert into storage.buckets (id, name, public)
  values ('meal-photos', 'meal-photos', false)
  on conflict (id) do nothing;

create policy meal_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy meal_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy meal_photos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy meal_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
