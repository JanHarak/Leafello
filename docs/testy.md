# Seznam akceptačních testů

Přehled všech očíslovaných testů ze zadání (`docs/zadani.md`, sekce 7).
Testy jsou **závazné** a píšou se **před** implementací dané části. Žádná
funkce se nepovažuje za hotovou, dokud neprocházejí testy uvedené v její
sekci.

Zadání definuje **75 očíslovaných akceptačních testů** (T-01 až T-69 plus
doplňující T-70 až T-75). Skupina T-16 až T-32 je v balíčku
`@dietapp/gamification-rules` rozpracovaná do **52 jednotkových testů**
(Vitest), které kromě zadaných vektorů pokrývají i hraniční případy.

**Legenda stavu**
- `hotovo` – implementováno a testy procházejí
- `čeká` – zatím neimplementováno (placeholder)

**Mapování fází** (sekce 9 zadání)

| Fáze | Testy |
|---|---|
| 0 – výpočet cílů | T-01 až T-15, T-70 až T-75 |
| 1 – auth, profil, onboarding, cíle | T-41 až T-47, T-62 |
| 2 – import, vyhledávání, deník, součty | T-33 až T-40, T-57 až T-61, T-63 |
| 3 – skener čárových kódů | T-64, T-65 |
| 4 – fotoanalýza přes Gemini | T-48 až T-56, T-66 |
| 5 – recepty, plány jídel | T-60 |
| 6 – avatar, XP, upomínky | T-16 až T-32, T-67 až T-69 |

---

## 7.1 Výpočet cílů (nutrition-calc)

Zaokrouhlování: BMR a TDEE na celé kcal, makra na celé gramy. BMR se do
dalších výpočtů předává **nezaokrouhlený**, zaokrouhluje se jen pro
zobrazení. Fáze 0. Stav: **hotovo** (balíček `@dietapp/nutrition-calc`,
21 vektorů rozpracováno do 25 testů).

| ID | Vstup | Očekávaný výstup |
|---|---|---|
| T-01 | Muž, 80 kg, 180 cm, 30 let | BMR = 1780 kcal |
| T-02 | Žena, 65 kg, 165 cm, 40 let | BMR = 1320 kcal |
| T-03 | Muž z T-01 + aktivita `moderate` (koef. 1,55) | TDEE = 2759 kcal |
| T-04 | Stav z T-03 + tempo 0,5 kg/týden | kcal_target = 2259, **bez varování** |
| T-05 | Žena z T-02 + aktivita `sedentary` (koef. 1,2) | TDEE = 1584 kcal |
| T-06 | Stav z T-05 + tempo 0,5 kg/týden | Výpočet 1084 kcal spadne pod limit → **kcal_target = 1200**, `warning = 'rate_not_safe'` |
| T-07 | Žena, 55 kg, 160 cm, 25 let, `sedentary`, tempo 0,75 kg/týden | TDEE = 1517, výpočet 767 kcal → **kcal_target = 1200**, `warning = 'rate_not_safe'` |
| T-08 | Muž, 95 kg, 185 cm, 45 let, `high` (koef. 1,725), tempo 1,0 kg/týden | BMR = 1886, TDEE = 3254, kcal_target = 2254, **bez varování** |
| T-09 | Tempo 1,5 kg/týden (nad maximem 1,0) | Vyhozena chyba `RateOutOfRange`, cíl se **nevytvoří** |
| T-10 | Cílová váha 48 kg při výšce 170 cm (BMI 16,6) | Vyhozena chyba `TargetWeightUnsafe`, v odpovědi nejnižší přijatelná váha **53,5 kg** (odpovídá BMI 18,5) |
| T-11 | Makra pro stav T-04 (80 kg, kcal_target 2259) | Bílkoviny **144 g**, tuky **64 g**, sacharidy **277 g** (tolerance ±2 g u sacharidů) |
| T-12 | Pitný cíl pro 80 kg | 2400 ml |
| T-13 | Pitný cíl pro 45 kg (výpočet 1350 ml) | **1500 ml** (dolní hranice) |
| T-14 | Pitný cíl pro 150 kg (výpočet 4500 ml) | **4000 ml** (horní hranice) |
| T-15 | Věk počítán z `birth_date` v den **před** narozeninami | Věk o 1 nižší než rozdíl kalendářních let |
| T-70 | Žena, 120 kg, 160 cm, 50 let, `sedentary`, tempo 1,0 kg/týden | BMR = 1789, TDEE = 2147, cíl = **1200** (hranice), bílkoviny 105 g, tuky 40 g, sacharidy 105 g, součet makro kalorií = 1200 kcal |
| T-71 | Muž, 60 kg, 165 cm, 60 let, `sedentary`, tempo 1,0 kg/týden | TDEE = 1604, výpočet 604 kcal → **kcal_target = 1500** (mužská hranice), `warning = 'rate_not_safe'` |
| T-72 | Žena, 65 kg, 165 cm, 40 let, `sedentary`, tempo 0 (udržování) | kcal_target = 1584, **bez varování** |
| T-73 | Výška 90 cm (mimo interval 100–250) | Vyhozena chyba `HeightOutOfRange` |
| T-74 | `birth_date` v budoucnosti | Vyhozena chyba `InvalidBirthDate` |
| T-75 | Jakýkoliv platný vstup (property test) | Sacharidy nikdy < 0 g; součet makro kalorií = kcal_target ±5 kcal |

---

## 7.2 XP a levely (gamification-rules)

Fáze 6. Stav: **hotovo** (balíček `@dietapp/gamification-rules`).

Hranice levelu: `threshold(L) = 50 · L · (L + 1)`. Level je nejvyšší `L`
s `threshold(L) ≤ xp`. Odměna za zapsaný den vyžaduje alespoň 2 jídla.

| ID | Vstup | Očekávaný výstup |
|---|---|---|
| T-16 | xp = 0 | level 0 |
| T-17 | xp = 99 | level 0 (těsně pod hranicí L1 = 100) |
| T-18 | xp = 100 | level 1 |
| T-19 | xp = 299 | level 1 (těsně pod hranicí L2 = 300) |
| T-20 | xp = 300 | level 2 |
| T-21 | xp = 1000 | level 4 |
| T-22 | Den s 1 zapsaným jídlem | **0 XP** za „zapsaný den" (potřeba jsou min. 2 jídla) |
| T-23 | Den se 2 jídly a splněným pitným cílem | 30 XP (20 za zapsaný den + 10 za pití) |
| T-24 | Příjem 2× nad cílem | XP se **neodečítá**, hodnota nikdy neklesá; záporný přírůstek vyhodí výjimku |
| T-25 | 1 vynechaný den (mezera 2 dny), záchrana dostupná | Série **pokračuje** (výsledek `saved`), `streak_saves_left = 0` |
| T-26 | 1 vynechaný den, záchrana už vyčerpaná | Série se **přeruší** (výsledek `reset`), `streak_days = 1` |
| T-27 | Přechod do nového kalendářního měsíce | `streak_saves_left` se obnoví na 1 |

---

## 7.3 Nálada avatara (gamification-rules)

Fáze 6. Stav: **hotovo**. Pravidla se vyhodnocují v pořadí, první platné
vyhrává. Oslava (`celebrating`) se vyhodnocuje jako první, před hladem
i žízní. Hraniční hodiny jsou inkluzivní, hranice podílu je přesně 0,5.

| ID | Stav | Nálada |
|---|---|---|
| T-28 | Žádný záznam dnes, 13:00 | `sleepy` |
| T-29 | Voda 30 % cíle, 16:00, jídlo zapsáno | `thirsty` |
| T-30 | Voda 100 %, kalorie 30 % cíle, 19:00 | `hungry` |
| T-31 | Vše splněno (záznamy, voda, kalorie) | `happy` |
| T-32 | Voda 30 % cíle v 10:00 | `happy` (podmínka žízně platí až po 15:00) |

---

## 7.4 Import potravin (off-import)

Fáze 2. Stav: **čeká**. Každý řádek je fixture pro validační pipeline
importu z Open Food Facts (pravidla F-03). Stav: **hotovo**
(balíček `@dietapp/off-import`).

| ID | Vstupní záznam (na 100 g) | Očekáváno |
|---|---|---|
| T-33 | kcal 400, bílkoviny 5, sacharidy 60, tuky 15 | **Přijat** (Atwaterova odchylka 1,3 %) |
| T-34 | kcal 250, bílkoviny 0, sacharidy 0, tuky 0 | **Zahozen** (kcal > 0, ale všechna makra = 0) |
| T-35 | tuky 120 (> 100) | **Zahozen** (makro mimo interval 0–100) |
| T-36 | kcal 1200 (> 900) | **Zahozen** (kcal mimo interval 0–900) |
| T-37 | Bez názvu | **Zahozen** (chybí povinný název) |
| T-38 | kcal 100, bílkoviny 20, sacharidy 20, tuky 20 (Atwater 340, odchylka 240 %) | **Zahozen** (Atwaterova kontrola nad 25 %) |
| T-39 | Dva záznamy se stejným `barcode`, jeden má vyplněno 8 polí, druhý 4 | **Ponechán** záznam s 8 vyplněnými poli, druhý zahozen |
| T-40 | Název o délce 350 znaků | **Přijat**, název zkrácen na 200 znaků |

---

## 7.5 RLS – izolace dat mezi uživateli

Fáze 1. Stav: **čeká**. Povinné v CI. Ověřuje, že uživatel nevidí ani
nezapíše cizí data. „Uživatel A" a „uživatel B" jsou dva různé účty.

| ID | Scénář | Očekáváno |
|---|---|---|
| T-41 | Uživatel A čte `diary_entries` uživatele B | 0 řádků |
| T-42 | Uživatel A vloží `diary_entries` s `user_id` = B | Odmítnuto |
| T-43 | Uživatel A čte `weight_logs` uživatele B | 0 řádků |
| T-44 | Uživatel A zapíše do `foods` se `source = 'off'` | Odmítnuto (zápis jen s vlastním `created_by` a `source <> 'off'`) |
| T-45 | Uživatel A čte cizí neveřejný recept | 0 řádků |
| T-46 | Uživatel A stáhne fotku z cesty `{B}/x.jpg` ve Storage | Odmítnuto |
| T-47 | Kontrola metadat: v `public` existuje tabulka s `rowsecurity = false` | Test **selže** (žádná tabulka nesmí být bez RLS) |

---

## 7.6 Edge Function `analyze-photo` (gemini-edge-fn)

Fáze 4. Stav: **čeká**. Kontraktní testy s mockem Gemini. Výsledek
fotoanalýzy se **nikdy** neuloží do deníku automaticky.

| ID | Scénář | Očekáváno |
|---|---|---|
| T-48 | Gemini vrátí validní JSON se 2 položkami | 2 položky, status `done`, do deníku se **nic** neuloží |
| T-49 | Gemini vrátí JSON obalený v ```` ```json ```` fence | Úspěšně naparsováno |
| T-50 | Gemini vrátí nevalidní JSON | Status `failed`, uživateli čitelná chyba, žádná výjimka do klienta |
| T-51 | `not_food = true` | Zpráva „Na fotce nevidím jídlo", prázdný seznam položek |
| T-52 | 11. analýza téhož dne při denním limitu 10 | HTTP **429** s vysvětlením |
| T-53 | `storage_path` patří jinému uživateli | HTTP **403** |
| T-54 | Volání bez JWT | HTTP **401** |
| T-55 | Gemini vrátí HTTP 429 | Jeden retry, pak čitelná chyba, `raw_response` uložena |
| T-56 | Položka s `estimated_grams` = 0 nebo záporné | Položka odfiltrována z výsledku |

---

## 7.7 Deník a snapshot

Fáze 2 (T-57 až T-59, T-61), fáze 5 (T-60). Stav: **částečně** –
výpočty T-57, T-60, T-61 hotové (`@dietapp/diary`), T-58 ověřen proti DB.
**T-59 čeká na rozhodnutí:** naráží na rozpor v zadání mezi
`on delete set null` a constraintem `num_nonnulls(food_id, recipe_id) = 1`.
Ověřuje neměnnost historie: denní součty se počítají ze `snapshot`, ne
joinem na aktuální `foods`.

| ID | Scénář | Očekáváno |
|---|---|---|
| T-57 | Potravina 250 kcal/100 g, zápis 37 g | 92,5 kcal, uloženo do `snapshot` |
| T-58 | Změna `kcal_100g` potraviny **po** zápisu | Historický záznam v `v_daily_totals` se **nemění** |
| T-59 | Smazání potraviny (`on delete set null`) | Záznam v deníku zůstává čitelný ze `snapshot` |
| T-60 | Recept na 4 porce, zapsána 1 porce | Hodnoty = součet ingrediencí děleno 4 |
| T-61 | Denní součet ze 3 záznamů | Odpovídá ručnímu součtu na celé kcal |

---

## 7.8 E2E scénáře (Maestro)

Fáze podle obsahu (viz mapování výše). Stav: **čeká**. Průchod celou
cestou uživatele přes reálné obrazovky.

| ID | Scénář |
|---|---|
| T-62 | Nový uživatel projde onboardingem a vidí nastavený cíl |
| T-63 | Vyhledání potraviny, zápis 150 g, denní součet se aktualizuje |
| T-64 | Sken existujícího čárového kódu vede na detail potraviny |
| T-65 | Sken neznámého kódu vede na formulář nové potraviny s předvyplněným kódem |
| T-66 | Fotka jídla, potvrzení dvou položek, zápis do deníku |
| T-67 | Zápis 500 ml vody, kruhový indikátor se posune |
| T-68 | Nastavení upomínky na 12:00 a její naplánování |
| T-69 | Smazání účtu, po opětovném přihlášení prázdný stav |

---

## Souhrn počtů

| Sekce | Testy | Počet | Stav |
|---|---|---|---|
| 7.1 Výpočet cílů | T-01–T-15, T-70–T-75 | 21 | hotovo |
| 7.2 XP a levely | T-16–T-27 | 12 | hotovo |
| 7.3 Nálada avatara | T-28–T-32 | 5 | hotovo |
| 7.4 Import potravin | T-33–T-40 | 8 | hotovo |
| 7.5 RLS | T-41–T-47 | 7 | hotovo |
| 7.6 Edge `analyze-photo` | T-48–T-56 | 9 | čeká |
| 7.7 Deník a snapshot | T-57–T-61 | 5 | částečně (T-59 čeká na rozhodnutí) |
| 7.8 E2E | T-62–T-69 | 8 | čeká |
| **Celkem** | | **75** | 57 hotovo |

Skupina T-16 až T-32 (17 akceptačních testů) je v balíčku
`@dietapp/gamification-rules` implementována jako **52 jednotkových testů**
včetně hraničních případů; spustí se `npm test`.
