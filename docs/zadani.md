# Zadání: Hybridní aplikace pro hubnutí

**Verze:** 1.0 (draft před implementací)
**Datum:** 2. 9. 2026
**Stack:** Expo (React Native + react-native-web) · Supabase (Postgres) · Google Gemini

---

## 1. Účel dokumentu

Toto zadání definuje rozsah, datový model, výpočetní pravidla a **akceptační testy** pro MVP.
Testy v tomto dokumentu jsou závazné a píšou se **před** implementací dané části. Žádná funkce se nepovažuje za hotovou, dokud neprocházejí testy uvedené v její sekci.

Značení požadavků: `F-x` funkční, `N-x` nefunkční, `T-x` test.

---

## 2. Produktová definice

### 2.1 Co aplikace je

Deník jídel a hubnutí s AI podporou. Uživatel si nastaví cíl, zapisuje jídla (vyhledáním, čárovým kódem nebo fotkou), sleduje pitný režim a váhu. Herní mechanika s avatarem má za cíl **udržet návyk zapisovat**, nikoliv motivovat k restrikci.

### 2.2 Co aplikace není

- Není medicínský prostředek ani diagnostický nástroj.
- Neposkytuje léčebná ani dietologická doporučení pro konkrétní zdravotní stav.
- Nenabízí extrémní kalorické cíle (viz F-06, bezpečnostní limity).

### 2.3 Klíčové metriky úspěchu

| Metrika | Cíl MVP |
|---|---|
| Čas na zapsání jídla (vyhledání a uložení) | < 15 s (medián) |
| Podíl uživatelů se 7 zapsanými dny v prvním týdnu | > 35 % |
| Retence D30 | > 20 % |
| Úspěšnost skenu čárového kódu (nalezena potravina) | > 70 % na CZ/SK produktech |

### 2.4 Persony

- **Jana, 34, kancelář.** Chce zhubnout 8 kg. Nemá čas na složité zapisování. Klíčové je pro ni skenování a rychlé opakování obvyklých jídel.
- **Petr, 41, občas sportuje.** Zajímá ho hlavně bílkovina a to, aby appka nebyla otravná. Používá web na počítači a mobil na skenování.
- **Lucie, 27, kuchařka amatérka.** Vaří sama, chce si zadat vlastní recepty a plánovat týden dopředu.

---

## 3. Funkční požadavky

### F-01 Registrace a přihlášení

- Magic link e-mailem (Supabase Auth), volitelně Apple / Google OAuth.
- Bez hesla ve MVP.
- Účet lze smazat včetně všech dat (GDPR, viz N-06).

**Akceptační kritéria**
- Po prvním přihlášení se uživatel dostane do onboardingu, ne na prázdný deník.
- Odhlášení smaže lokální cache citlivých dat.

### F-02 Onboarding a profil

Sbírané údaje: pohlaví, datum narození, výška (cm), aktuální váha (kg), úroveň aktivity, cílová váha, požadované tempo (kg/týden).

- Jednotky: metrické ve MVP. Imperiální jednotky jsou mimo rozsah.
- Úroveň aktivity jako 5 popisných možností, ne jako číslo (uživatel nevidí koeficient).

### F-03 Databáze potravin

- Zdroj: **Open Food Facts** (ODbL). Vlastní importovaná tabulka, žádné dotazování cizího API za běhu.
- Import filtruje na produkty s prodejem v CZ/SK plus globálně časté produkty.
- Uživatel může vytvořit vlastní potravinu (`source = 'user'`), viditelnou pouze jemu.
- Povinná atribuce v aplikaci: „Data o potravinách © Open Food Facts contributors, licence ODbL".

**Pravidla validace při importu (závazná)**

| Pravidlo | Akce při porušení |
|---|---|
| Chybí název nebo `kcal_100g` | Zahodit záznam |
| `kcal_100g` mimo interval 0 až 900 | Zahodit |
| Jakékoliv z `protein/carbs/fat_100g` > 100 nebo < 0 | Zahodit |
| Součet `protein + carbs + fat` > 105 g | Zahodit |
| Atwaterova kontrola: \|kcal − (4P + 4C + 9F)\| / kcal > 0,25 | Zahodit |
| `kcal_100g` > 0 a všechna makra = 0 | Zahodit |
| Duplicitní `barcode` | Ponechat záznam s nejvíce vyplněnými poli, ostatní zahodit |
| Název delší než 200 znaků | Zkrátit |

### F-04 Vyhledávání potravin

- Full-text search nad názvem a značkou (`tsvector`, čeština) plus fuzzy fallback (`pg_trgm`) při méně než 5 výsledcích.
- Řazení: přesná shoda → uživatelovy oblíbené → verifikované → ostatní podle úplnosti dat.
- Odpověď p95 pod 300 ms při 500 tisících záznamech.

### F-05 Deník jídel

- Typy jídel: snídaně, oběd, večeře, snack.
- Zápis: potravina + gramáž, nebo potravina + porce z `food_servings`.
- Denní součty: kcal, bílkoviny, sacharidy, tuky, vláknina.
- **Snapshot:** každý záznam ukládá výživové hodnoty v okamžiku zápisu do `snapshot` (jsonb). Pozdější změna potraviny nikdy nemění historii.
- Rychlé akce: kopírovat včerejší jídlo, opakovat naposledy zapsané.

### F-06 Výpočet cílů (kritická komponenta)

**BMR, Mifflin-St Jeor**
- muž: `10·kg + 6,25·cm − 5·věk + 5`
- žena: `10·kg + 6,25·cm − 5·věk − 161`

**Koeficienty aktivity**

| Úroveň | Popis v UI | Koeficient |
|---|---|---|
| sedentary | Převážně sedím | 1,2 |
| light | Lehká aktivita 1 až 3× týdně | 1,375 |
| moderate | Cvičím 3 až 5× týdně | 1,55 |
| high | Cvičím 6 až 7× týdně | 1,725 |
| very_high | Fyzická práce nebo denně tvrdý trénink | 1,9 |

`TDEE = round(BMR_nezaokrouhlené · koeficient)`
`kcal_target = TDEE − (rate_kg_per_week · 1000)`

**Zaokrouhlování (závazné, jinak testy nedávají jednoznačný výsledek):** BMR se do dalších výpočtů předává **nezaokrouhlený**, zaokrouhluje se jen pro zobrazení. TDEE se zaokrouhlí na celé kcal a z něj se počítá cíl.

**Bezpečnostní limity (nepřekročitelné)**
- Dolní hranice: **1200 kcal** pro ženy, **1500 kcal** pro muže.
- Pokud vypočtený cíl padne pod hranici, cíl se nastaví na hranici a aplikace zobrazí informaci, že požadované tempo není při daných parametrech bezpečně dosažitelné, s doporučením konzultace s lékařem nebo nutričním terapeutem.
- Maximální nabízené tempo: 1,0 kg/týden.
- Cílová váha odpovídající BMI < 18,5 se nepřijme. Aplikace vysvětlí proč a nabídne nejnižší přijatelnou váhu.

**Makroživiny**
1. bílkoviny: `round(1,8 · kg)`, ale nejvýše `round(0,35 · kcal_target / 4)`
2. tuky: `round(0,8 · kg)`, ale nejvýše `round(0,30 · kcal_target / 9)`
3. sacharidy: `round((kcal_target − bílkoviny·4 − tuky·9) / 4)`

Stropy nejsou kosmetika. U vysoké tělesné hmotnosti spojené s nízkým cílem by pravidlo „g na kilogram" vyčerpalo celý kalorický cíl bílkovinami a tuky a na sacharidy by nezbylo nic. Procentní strop 35 / 30 zaručuje, že sacharidy nikdy nevyjdou negativní.

**Pitný cíl**
`water_ml = clamp(round(30 · kg / 50) · 50, 1500, 4000)` (zaokrouhleno na 50 ml)

### F-07 Váha

- Jeden záznam na den, přepisovatelný.
- Graf s 7denním klouzavým průměrem. Surová denní data se zobrazují slabě, průměr výrazně, protože denní fluktuace uživatele zbytečně stresují.
- Bez hodnotících formulací u nárůstu váhy.

### F-08 Pitný režim

- Rychlá tlačítka 200 / 330 / 500 ml plus vlastní hodnota.
- Kruhový indikátor na hlavní obrazovce.
- Historie po dnech, samostatná od deníku jídel.

### F-09 Skenování čárových kódů

- `expo-camera` s podporou EAN-8, EAN-13, UPC-A.
- Nalezeno: přeskok na detail s předvyplněnou porcí.
- Nenalezeno: nabídka „Přidat produkt" s předvyplněným čárovým kódem.
- Na webu je skenování volitelné (závisí na dostupnosti kamery), není blokující.

### F-10 Rozpoznání jídla z fotky (Gemini)

**Průběh**
1. Klient zmenší fotku na max. 1024 px delší strany, JPEG kvalita 80.
2. Upload do Supabase Storage, bucket `meal-photos`, cesta `{user_id}/{uuid}.jpg`.
3. Klient volá Edge Function `analyze-photo` s cestou k souboru.
4. Funkce zavolá Gemini (model řady Flash, přesná verze v konfiguraci) se structured output.
5. Uživatel dostane seznam odhadů, **potvrdí nebo upraví**, pak se ukládá do deníku.

**Schéma odpovědi Gemini (`responseSchema`)**
```json
{
  "items": [
    {
      "name": "string",
      "estimated_grams": "number",
      "confidence": "number 0-1",
      "kcal_100g": "number",
      "protein_100g": "number",
      "carbs_100g": "number",
      "fat_100g": "number"
    }
  ],
  "not_food": "boolean",
  "notes": "string"
}
```

**Povinná pravidla**
- Nikdy se výsledek neuloží automaticky. Vždy potvrzení uživatelem.
- V UI je vždy vidět, že jde o odhad, nikoliv měření.
- `confidence < 0,4` se zobrazuje s výraznějším upozorněním na nejistotu.
- `not_food = true` vede na zprávu „Na fotce nevidím jídlo", nikoliv na prázdný seznam.
- Denní limit analýz na uživatele, konfigurovatelný (výchozí 10 u free tarifu).
- API klíč pouze v Supabase secrets. Nikdy v klientovi, nikdy v repozitáři.

### F-11 Recepty

- Vlastní recept: název, počet porcí, ingredience (potravina + gramáž), postup.
- Výživové hodnoty se počítají ze složek na jednu porci.
- Recept lze zapsat do deníku jako `n` porcí.
- Generování receptu přes Gemini podle zadaných makroživin a preferencí, s povinným potvrzením a možností editace. Vygenerované hodnoty se ukládají jako `source = 'ai'` a nejsou verifikované.

### F-12 Plány jídel

- Plán na 1 až 4 týdny, položky přiřazené ke dni a typu jídla.
- Jedním tlačítkem „přenést den do deníku".
- Bez automatického zapisování bez potvrzení.

### F-13 Upomínky

Dva mechanismy:

| Typ | Technologie | Použití |
|---|---|---|
| Lokální | `expo-notifications` | jídla, pitný režim, vážení |
| Push | FCM přes Edge Function | týdenní shrnutí (fáze 6) |

- Nastavení v tabulce `reminders`, klient z ní při startu naplánuje lokální notifikace.
- Nikdy více než 8 notifikací denně celkem.
- Tón zpráv neutrální a nevyčítavý. Zakázané formulace typu „už zase jsi nezapsal" nebo cokoliv, co uživatele hodnotí.
- Vypnutí všech upomínek jedním přepínačem.

### F-14 Avatar a herní mechanika

- Vlastní originální postava. **Zákaz** používání avokáda nebo jiné maskoty konkurenčních aplikací.
- Technologie: Rive pro animované stavy. Fallback sada SVG pro web.
- Nálady: `happy`, `hungry`, `thirsty`, `sleepy`, `celebrating`.

**Pravidla nálady (vyhodnocují se v tomto pořadí, první platí)**

| Podmínka | Nálada |
|---|---|
| Právě získán odznak nebo level | celebrating |
| Dnes žádný záznam a je po 12:00 | sleepy |
| Voda < 50 % cíle a je po 15:00 | thirsty |
| Zapsáno < 50 % cílových kcal a je po 18:00 | hungry |
| Jinak | happy |

**Oslava má přednost.** `celebrating` se vyhodnocuje jako **první**, před hladem i žízní. Uživatel, který si právě odemkl level v sedm večer s nesplněným pitným cílem, má vidět oslavu, ne žíznivou postavu. Oslava je krátkodobá a připomínka pití přijde za minutu sama.

**Neexistuje nálada, která uživatele hodnotí.** Žádný „nespokojený" ani „zklamaný". Nálada hodnotící uživatele je výtka obrázkem, a ta je horší než výtka textem, protože se před ní nedá zavřít oči.

**XP (závazné)**

| Akce | XP |
|---|---|
| Zapsaný den (aspoň 2 jídla) | 20 |
| Splněný pitný cíl | 10 |
| Zvážení se | 5 |
| Dokončený celý týden zápisů | 50 |
| Vytvořený recept | 15 |

**Za co se XP nikdy nedává:** kalorický deficit, nízký příjem, „nulový den", hubnutí o X kg. Systém odměňuje vedení deníku, nikoliv restrikci. Za překročení cíle se nikdy neodebírají body.

Pravidlo je vynucené dvěma způsoby, ne jen komentářem. Vstup pro výpočet XP **záměrně neobsahuje zapsané kalorie ani váhu**, takže je nemůže použít. Typ spouštěče odznaku neobsahuje deficit ani zhubnuté kilogramy, takže takový odznak neprojde kompilací.

**Bonus za týden** se přiznává při dosažení násobku sedmi v sérii, ne za kalendářní týden. Kdo začne ve středu, nemá na bonus čekat do neděle.

**Herní mechanika se nezobrazuje při aktivní eskalaci** podle sekce 8.1. Oslava série někomu, kdo pět dní jí pod polovinou cíle, je to poslední, co potřebuje.

**Levely:** `threshold(L) = 50 · L · (L + 1)`, level je nejvyšší `L` s `threshold(L) ≤ xp`.

**Série dní:** přerušení po jednom nezapsaném dni, ale uživatel má **1 záchranu série za kalendářní měsíc**, která se aplikuje automaticky.

---

## 4. Datový model

```sql
create type sex_t            as enum ('male','female');
create type activity_t       as enum ('sedentary','light','moderate','high','very_high');
create type meal_t           as enum ('breakfast','lunch','dinner','snack');
create type food_source_t    as enum ('off','user','ai');
create type reminder_t       as enum ('meal','water','weigh_in','weekly_summary');
create type mood_t           as enum ('happy','hungry','thirsty','sleepy','celebrating');

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

create table photo_analyses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  storage_path text not null,
  model        text not null,
  raw_response jsonb,
  status       text not null default 'pending',
  created_at   timestamptz not null default now()
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
  user_id          uuid primary key references auth.users on delete cascade,
  level            int not null default 0,
  xp               int not null default 0,
  streak_days      int not null default 0,
  streak_saves_left int not null default 1,
  streak_month     date,
  last_active_on   date,
  mood             mood_t not null default 'happy',
  unlocked         jsonb not null default '[]'
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
```

**Pohled na denní součty**

```sql
create view v_daily_totals as
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
```

### 4.1 RLS

Povinné pro **každou** tabulku. Žádná tabulka nesmí být nasazena bez politiky.

- `profiles`, `goals`, `weight_logs`, `diary_entries`, `water_logs`, `meal_plans`, `meal_plan_items`, `photo_analyses`, `reminders`, `avatar_state`, `user_achievements`: čtení i zápis pouze `user_id = auth.uid()` (u `profiles` `id = auth.uid()`).
- `foods`: čtení, pokud `source = 'off'` nebo `created_by = auth.uid()`. Zápis pouze s `created_by = auth.uid()` a `source <> 'off'`.
- `food_servings`: dědí podle nadřazené potraviny.
- `recipes`: čtení `owner_id = auth.uid() or is_public`. Zápis pouze vlastní.
- `achievements`: čtení pro všechny přihlášené, zápis pouze service role.
- Storage bucket `meal-photos`: privátní, přístup jen k cestě začínající `{auth.uid()}/`.

---

## 5. Edge Functions

| Funkce | Vstup | Výstup | Poznámky |
|---|---|---|---|
| `analyze-photo` | `{ storage_path }` | `{ items[], not_food, notes }` | rate limit, ověření vlastnictví cesty, timeout 20 s |
| `generate-recipe` | `{ kcal, protein_g, preferences[], exclude[] }` | struktura receptu | výsledek neverifikovaný |
| `weekly-summary` | cron | push notifikace | fáze 6 |
| `delete-account` | `{}` | `{ ok }` | smaže data i soubory ve Storage |

Společná pravidla:
- Ověření JWT, odmítnutí anonymních volání.
- Klíč Gemini pouze ze `Deno.env`.
- Retry: 2 pokusy, exponenciální backoff, na 429 z Gemini se vrací uživateli čitelná zpráva.
- Logování: nikdy neloguj obsah fotky ani osobní údaje. Loguj jen `user_id`, model, latenci, stav.

---

## 6. Nefunkční požadavky

- **N-01 Výkon:** vyhledání potraviny p95 < 300 ms, otevření deníku < 1 s na středním Androidu.
- **N-02 Offline:** zápis do deníku, vody a váhy funguje offline s frontou a synchronizací při obnovení sítě. Řešení konfliktů: poslední zápis vyhrává, u váhy podle `logged_on`.
- **N-03 Platformy:** iOS 16+, Android 10+, web Chrome/Safari/Firefox aktuální verze.
- **N-04 Vícejazyčnost:** čeština je **zdrojový a primární jazyk**, ze kterého se překládá a na který padají chybějící texty. Ve MVP vydaná také slovenština a angličtina. Architektura musí umožnit přidání jazyka bez databázové migrace a bez zásahu do komponent: seznam jazyků drží jediný registr v aplikaci. Jazyky mají stav `source`, `released` (musí být úplný) a `beta` (chybějící texty padají na češtinu). Plurály se řeší podle CLDR, ne ručními podmínkami, protože čeština má tři formy pro celá čísla a čtvrtou pro desetinná.
- **N-05 Přístupnost:** minimální velikost cíle dotyku 44 px, kontrast WCAG AA, podpora zvětšeného písma, popisky pro čtečky.
- **N-06 GDPR:** export dat (JSON) a smazání účtu do 30 dnů, obojí self-service v aplikaci. Fotky jídel se mažou spolu s účtem.
- **N-07 Licence:** viditelná atribuce ODbL. Databáze potravin se nešíří pod uzavřenější licencí.
- **N-08 Bezpečnost:** žádné tajné klíče v klientu, žádné `service_role` v aplikaci, RLS ověřená testy.
- **N-09 Observabilita:** Sentry pro chyby, základní eventy pro metriky ze sekce 2.3.

---

## 7. Testovací strategie

| Úroveň | Nástroj | Co pokrývá |
|---|---|---|
| Unit | Vitest | výpočty výživy, XP a levely, nálada avatara, validace importu |
| DB / RLS | pgTAP nebo SQL skripty v CI | izolace dat mezi uživateli, constraints |
| Kontrakt | Vitest + mock Gemini | Edge Functions, parsování odpovědi, chybové stavy |
| Integrační | Supabase local (Docker) | vyhledávání, denní součty, snapshot |
| E2E | Maestro | onboarding, zápis jídla, sken, fotka |

**Pravidlo:** modul `nutrition-calc` se implementuje výhradně metodou test-first. Testy T-01 až T-12 musí existovat a být červené, než se napíše první řádek implementace.

### 7.1 Testy výpočtu cílů

Zaokrouhlování: BMR a TDEE na celé kcal, makra na celé gramy.

| ID | Vstup | Očekávaný výstup |
|---|---|---|
| T-01 | muž, 80 kg, 180 cm, 30 let | BMR = 1780 |
| T-02 | žena, 65 kg, 165 cm, 40 let | BMR = 1320 |
| T-03 | T-01 + moderate (1,55) | TDEE = 2759 |
| T-04 | T-03 + tempo 0,5 kg/týd. | kcal_target = 2259, bez varování |
| T-05 | T-02 + sedentary (1,2) | TDEE = 1584 |
| T-06 | T-05 + tempo 0,5 kg/týd. | výpočet 1084 → **kcal_target = 1200**, `warning = 'rate_not_safe'` |
| T-07 | žena, 55 kg, 160 cm, 25 let, sedentary, 0,75 kg/týd. | TDEE = 1517, výpočet 767 → **kcal_target = 1200**, `warning = 'rate_not_safe'` |
| T-08 | muž, 95 kg, 185 cm, 45 let, high (1,725), 1,0 kg/týd. | BMR = 1886, TDEE = 3254, kcal_target = 2254, bez varování |
| T-09 | tempo 1,5 kg/týd. | vyhozena chyba `RateOutOfRange`, cíl se nevytvoří |
| T-10 | cílová váha 48 kg při výšce 170 cm (BMI 16,6) | vyhozena chyba `TargetWeightUnsafe`, v odpovědi nejnižší přijatelná váha 53,5 kg |
| T-11 | makra pro T-04 (80 kg, 2259 kcal) | bílkoviny 144 g, tuky 64 g, sacharidy 277 g (tolerance ±2 g u sacharidů) |
| T-12 | pitný cíl pro 80 kg | 2400 ml |
| T-13 | pitný cíl pro 45 kg (výpočet 1350) | 1500 ml (dolní hranice) |
| T-14 | pitný cíl pro 150 kg (výpočet 4500) | 4000 ml (horní hranice) |
| T-15 | věk počítán z `birth_date` v den před narozeninami | věk o 1 nižší než rozdíl let |
| T-70 | žena, 120 kg, 160 cm, 50 let, sedentary, 1,0 kg/týd. | BMR = 1789, TDEE = 2147, cíl 1200 (hranice), bílkoviny 105 g, tuky 40 g, sacharidy 105 g, součet = 1200 kcal |
| T-71 | muž, 60 kg, 165 cm, 60 let, sedentary, 1,0 kg/týd. | TDEE = 1604, výpočet 604 → **kcal_target = 1500**, `warning = 'rate_not_safe'` |
| T-72 | žena, 65 kg, 165 cm, 40 let, sedentary, tempo 0 (udržování) | kcal_target = 1584, bez varování |
| T-73 | výška 90 cm | chyba `HeightOutOfRange` |
| T-74 | `birth_date` v budoucnosti | chyba `InvalidBirthDate` |
| T-75 | jakýkoliv platný vstup | sacharidy nikdy < 0, součet makro kalorií = cíl ±5 kcal |

### 7.2 Testy XP a levelů

| ID | Vstup | Očekávaný výstup |
|---|---|---|
| T-16 | xp = 0 | level 0 |
| T-17 | xp = 99 | level 0 |
| T-18 | xp = 100 | level 1 |
| T-19 | xp = 299 | level 1 |
| T-20 | xp = 300 | level 2 |
| T-21 | xp = 1000 | level 4 |
| T-22 | den s 1 zapsaným jídlem | 0 XP za „zapsaný den" |
| T-23 | den s 2 jídly a splněnou vodou | 30 XP |
| T-24 | příjem 2× nad cílem | XP se neodečítá, hodnota nikdy neklesá |
| T-25 | 1 vynechaný den, záchrana dostupná | streak pokračuje, `streak_saves_left = 0` |
| T-26 | 1 vynechaný den, záchrana vyčerpána | streak = 0 |
| T-27 | nový kalendářní měsíc | `streak_saves_left` se obnoví na 1 |

### 7.3 Testy nálady avatara

| ID | Stav | Nálada |
|---|---|---|
| T-28 | žádný záznam, 13:00 | sleepy |
| T-29 | voda 30 %, 16:00, jídlo zapsáno | thirsty |
| T-30 | voda 100 %, kcal 30 %, 19:00 | hungry |
| T-31 | vše splněno | happy |
| T-32 | voda 30 % v 10:00 | happy (podmínka platí až po 15:00) |

### 7.4 Testy importu potravin

Každý řádek je fixture pro importní pipeline.

| ID | Vstupní záznam (na 100 g) | Očekáváno |
|---|---|---|
| T-33 | kcal 400, P 5, C 60, F 15 | přijat (Atwater odchylka 1,3 %) |
| T-34 | kcal 250, P 0, C 0, F 0 | zahozen |
| T-35 | F 120 | zahozen |
| T-36 | kcal 1200 | zahozen |
| T-37 | bez názvu | zahozen |
| T-38 | kcal 100, P 20, C 20, F 20 (Atwater 340, odchylka 240 %) | zahozen |
| T-39 | dva záznamy se stejným barcode, jeden má vyplněno 8 polí, druhý 4 | ponechán ten s 8 poli |
| T-40 | název 350 znaků | přijat, zkrácen na 200 |

### 7.5 Testy RLS (povinné v CI)

| ID | Scénář | Očekáváno |
|---|---|---|
| T-41 | Uživatel A čte `diary_entries` uživatele B | 0 řádků |
| T-42 | Uživatel A vloží `diary_entries` s `user_id` = B | odmítnuto |
| T-43 | Uživatel A čte `weight_logs` uživatele B | 0 řádků |
| T-44 | Uživatel A zapíše do `foods` se `source = 'off'` | odmítnuto |
| T-45 | Uživatel A čte cizí neveřejný recept | 0 řádků |
| T-46 | Uživatel A stáhne fotku z cesty `{B}/x.jpg` | odmítnuto |
| T-47 | Kontrola metadat: existuje tabulka s `rowsecurity = false` | test selže |

### 7.6 Testy Edge Function `analyze-photo`

| ID | Scénář | Očekáváno |
|---|---|---|
| T-48 | Gemini vrátí validní JSON s 2 položkami | 2 položky, status `done`, nic se neuloží do deníku |
| T-49 | Gemini vrátí JSON obalený v ```json fence | úspěšně naparsováno |
| T-50 | Gemini vrátí nevalidní JSON | status `failed`, uživateli čitelná chyba, žádná výjimka do klienta |
| T-51 | `not_food = true` | zpráva „Na fotce nevidím jídlo", prázdný seznam položek |
| T-52 | 11. analýza téhož dne při limitu 10 | HTTP 429 s vysvětlením |
| T-53 | `storage_path` patří jinému uživateli | HTTP 403 |
| T-54 | volání bez JWT | HTTP 401 |
| T-55 | Gemini vrátí 429 | jeden retry, pak čitelná chyba, `raw_response` uložena |
| T-56 | `estimated_grams` = 0 nebo negativní | položka odfiltrována |

### 7.7 Testy deníku a snapshotu

| ID | Scénář | Očekáváno |
|---|---|---|
| T-57 | Potravina 250 kcal/100 g, zápis 37 g | 92,5 kcal, uloženo do `snapshot` |
| T-58 | Změna `kcal_100g` potraviny po zápisu | historický záznam v `v_daily_totals` se nemění |
| T-59 | Smazání potraviny (`on delete set null`) | záznam v deníku zůstává čitelný ze `snapshot` |
| T-60 | Recept na 4 porce, zapsána 1 porce | hodnoty = součet ingrediencí / 4 |
| T-61 | Denní součet ze 3 záznamů | odpovídá ručnímu součtu na celé kcal |

### 7.8 E2E scénáře

| ID | Scénář |
|---|---|
| T-62 | Nový uživatel projde onboardingem a vidí nastavený cíl |
| T-63 | Vyhledání potraviny, zápis 150 g, denní součet se aktualizuje |
| T-64 | Sken existujícího čárového kódu vede na detail potraviny |
| T-65 | Sken neznámého kódu vede na formulář nové potraviny s předvyplněným kódem |
| T-66 | Fotka jídla, potvrzení dvou položek, zápis do deníku |
| T-67 | Zápis 500 ml vody, indikátor se posune |
| T-68 | Nastavení upomínky na 12:00 a její naplánování |
| T-69 | Smazání účtu, po opětovném přihlášení prázdný stav |

---

## 8. Skilly a agenti (plugin superpowers)

| Skill | Obsah | Kdy vzniká |
|---|---|---|
| `nutrition-calc` | formule ze F-06, bezpečnostní limity, test vektory T-01 až T-15 | **první, test-first** |
| `supabase-schema` | konvence migrací, povinné RLS, naming, seed data | fáze 1 |
| `off-import` | normalizační a validační pravidla F-03, fixtures T-33 až T-40 | fáze 2 |
| `gemini-edge-fn` | šablona Edge Function: responseSchema, retry, rate limit, sanitizace logů | fáze 4 |
| `expo-screen` | scaffolding obrazovky, design tokeny, navigace, i18n | fáze 1 |
| `gamification-rules` | XP tabulka, level křivka, série se záchranou, odznaky, pravidla nálady, zákaz odměn za restrikci | fáze 6 |
| `nutrition-analyst` | interpretace dat uživatele, textová zpětná vazba, mantinely pro to, co aplikace smí a nesmí říkat | fáze 5 |

### 8.1 Skill `nutrition-analyst`

Tenhle skill neřeší matematiku, tu má `nutrition-calc`. Řeší **jazyk a hranice** toho, co aplikace uživateli o jeho datech napíše. Používá se všude, kde vzniká text hodnotící uživatelovo jídlo: týdenní shrnutí, komentář k dennímu příjmu, generování receptů, doporučení k cílům.

**Co skill umí**
- Popsat trendy z dat: podíl bílkovin, pravidelnost zápisů, plnění pitného cíle, vývoj klouzavého průměru váhy.
- Navrhnout konkrétní a proveditelnou úpravu, například doplnit bílkovinu ke snídani, protože 70 % denního příjmu bílkovin padá na večeři.
- Rozpoznat, kdy data neumožňují nic tvrdit, a říct to. Tři zapsané dny nejsou trend.

**Mantinely (nepřekročitelné)**
- Žádná diagnóza, žádná léčba, žádná doporučení vázaná na konkrétní diagnózu nebo léky.
- Žádné hodnocení jídla morální slovní zásobou. Zakázané: „hřích", „provinilé", „špatné jídlo", „zdravé versus nezdravé" jako binární škatulka. Jídla se popisují nutričně, ne morálně.
- Žádné hodnocení uživatele. Komentuje se chování a data, nikdy člověk.
- Nikdy nenavrhovat příjem pod limity z F-06 ani vynechávání jídel jako nástroj deficitu.
- Při nárůstu váhy neutrální popis a kontext běžné fluktuace, nikdy výtka.

**Detekce rizikového vzorce a eskalace**
Pokud data ukazují některý z těchto vzorců, skill přestane dávat rady k příjmu a zobrazí nabídku odborné pomoci:
- 5 a více dní v řadě se zapsaným příjmem pod 50 % cíle
- pokles váhy rychlejší než 1,5 kg/týden ve dvou týdnech po sobě
- opakované ruční nastavování cíle na dolní hranici
- BMI pod 18,5 u aktuální váhy

V takovém případě je výstupem věcné a nevyčítavé sdělení, že aplikace na tohle není správný nástroj, plus odkaz na odbornou pomoc. Pro Česko: **Anabell**, kontaktní centrum pro poruchy příjmu potravy. Doporučení a další rady k příjmu se v tomto stavu negenerují.

Tenhle skill je záměrně restriktivní. Aplikace na hubnutí s generativním modelem je přesně to prostředí, kde neopatrně formulovaná věta může někomu ublížit, a náklady na opatrnost jsou přitom skoro nulové.

**Agenti pro review**

| Agent | Kontroluje |
|---|---|
| `rls-auditor` | každá nová tabulka má RLS a alespoň jednu politiku, žádné `service_role` v klientu |
| `nutrition-test-writer` | ke každé změně výpočtů existuje test, limity nejsou obejitelné |
| `secret-scanner` | žádný API klíč v diffu ani v `app.config`, `EXPO_PUBLIC_*` neobsahuje tajemství |
| `nutrition-safety-reviewer` | každý text a prompt jdoucí k uživateli projde mantinely z 8.1: žádná morální slovní zásoba u jídla, žádné doporučení pod limity, přítomná eskalační cesta |

---

## 9. Fáze a definice hotového

| Fáze | Obsah | Hotovo, když |
|---|---|---|
| 0 | Repo, CI, Supabase local, skilly `nutrition-calc` a `expo-schema` | T-01 až T-15 zelené |
| 1 | Auth, profil, onboarding, cíle | T-41 až T-47, T-62 zelené |
| 2 | Import OFF, vyhledávání, deník, denní součty | T-33 až T-40, T-57 až T-61, T-63 zelené, N-01 splněno |
| 3 | Skener čárových kódů | T-64, T-65 zelené |
| 4 | Fotka jídla přes Gemini | T-48 až T-56, T-66 zelené |
| 5 | Recepty, plány jídel | T-60 zelené |
| 6 | Avatar, XP, upomínky, grafy, monetizace | T-16 až T-32, T-67 až T-69 zelené |

Fáze 2 je jádro produktu. Do fáze 3 se nepokračuje, dokud není splněn cíl 15 s na zápis jídla ze sekce 2.3.

---

## 10. Mimo rozsah MVP

Sociální feed a sdílení, integrace Apple Health a Google Fit, aplikace pro hodinky, počítání aktivních kalorií ze sportu, komunitní verifikace potravin, imperiální jednotky, offline režim pro fotoanalýzu.

---

## 11. Otevřené otázky

1. Monetizace: co přesně je za paywallem? Návrh: fotoanalýza nad 3 denně, plány jídel, historie nad 90 dnů.
2. Verifikace uživatelských potravin: nechat je navždy privátní, nebo zavést proces sdílení?
3. Přesná verze Gemini modelu a rozpočtový strop na měsíc.
4. Návrh a jméno avatara.
5. Ochranná známka a název aplikace.
