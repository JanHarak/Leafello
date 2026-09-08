# Use cases a přehled testů

Produktově zaměřený přehled aplikace: **co uživatel dělá** (use cases, UC),
**jak je to otestované** (automatické testy) a **co projít ručně** (manuální
checklist), dokud nejsou E2E testy. Doplňuje `docs/testy.md`, který drží
očíslované akceptační testy T-01 až T-75 ze zadání (`docs/zadani.md`).

> **Stav MVP.** UI se bude ještě předělávat, proto zatím nejsou E2E testy
> (Maestro). Logika je krytá jednotkovými testy, přístupová práva a snapshoty
> testy nad databází; UI se ověřuje manuálním checklistem níže.

**Legenda stavu:** ✅ hotovo · 🟡 částečně · ⏳ čeká

## Aktéři

- **Návštěvník** – nepřihlášený uživatel; vidí ukázková data, nemůže ukládat.
- **Uživatel** – přihlášený (Google je prioritní, e-mail magic link jako záloha).
- **Systém** – Supabase (Postgres/Auth/Storage, RLS), Edge Functions (Deno),
  Google Gemini pro fotoanalýzu.

---

## Přehled use cases

| UC | Název | Funkce | Testy | Stav |
|---|---|---|---|---|
| UC-01 | Přihlášení a odhlášení | F-01 | T-62, MT-01 | ✅ |
| UC-02 | Onboarding a výpočet cíle | F-02, F-06 | T-01–T-15, T-70–T-75, MT-02 | ✅ |
| UC-03 | Zápis potraviny do deníku | F-04, F-05 | T-33–T-40, T-57–T-59, MT-03 | ✅ |
| UC-04 | Vytvoření vlastní potraviny | F-03 | T-44, MT-04 | ✅ |
| UC-05 | Pitný režim | F-08 | MT-05 | ✅ |
| UC-06 | Zápis váhy | F-07 | MT-06 | ✅ |
| UC-07 | Fotoanalýza jídla | F-10 | T-48–T-56, T-66, MT-07 | ✅ |
| UC-08 | Vytvoření a uložení receptu | F-11 | T-60, MT-08 | ✅ |
| UC-09 | Úprava uloženého receptu | F-11 | MT-09 | ✅ |
| UC-10 | Plán jídel a přenos dne do deníku | F-12 | MT-10 | ✅ |
| UC-11 | Upomínky (pití, jídlo) | F-13 | MT-11 | 🟡 web náhled; nativní plánování |
| UC-12 | Motivace: XP, level, série, nálada | F-14 | T-16–T-32, T-67–T-69, MT-12 | ✅ pravidla; 🟡 odznaky |
| UC-13 | Bezpečnostní eskalace | 8.1 | MT-13 | ✅ |
| UC-14 | Export mých dat (GDPR) | N-06 | MT-14 | ✅ |
| UC-15 | Smazání účtu (GDPR) | N-06 | MT-15 | ✅ |
| UC-16 | Právní dokumenty v aplikaci | N-06 | MT-16 | ✅ draft |
| UC-17 | Přepnutí jazyka | N-03 | MT-17 | ✅ |
| UC-18 | Skener čárových kódů | F-09 | T-64, T-65 | ⏳ |
| UC-19 | Týdenní shrnutí (push) | F-13 | T-68, T-69 | ⏳ |
| UC-20 | Generování receptu AI | F-11 | – | ⏳ |

---

## Detaily use cases

### UC-01 Přihlášení a odhlášení ✅
- **Aktér:** Návštěvník → Uživatel.
- **Předpoklad:** platný Google účet (nebo e-mail).
- **Hlavní tok:** Úvod → *Přihlásit se* → *Přihlásit přes Google* → souhlas →
  návrat do aplikace jako přihlášený. Odhlášení tlačítkem na úvodu.
- **Alternativy:** e-mail magic link / OTP (záloha). Zrušení souhlasu →
  zůstává nepřihlášen.
- **Poznámka:** Google je prioritní metoda.

### UC-02 Onboarding a výpočet cíle ✅
- **Aktér:** Uživatel bez cíle.
- **Tok:** *Nastavit cíl* → pohlaví, datum narození, výška, váha, cílová váha,
  aktivita, tempo → *Spočítat cíl* → uloží profil a aktivní cíl, zobrazí
  denní kcal a makra.
- **Bezpečnostní pravidla:** kcal se nikdy nenastaví pod bezpečnou hranici
  (1200/1500); příliš rychlé tempo se zkrátí a zobrazí upozornění; příliš
  nízká cílová váha se odmítne (T-70–T-75).

### UC-03 Zápis potraviny do deníku ✅
- **Aktér:** Uživatel.
- **Tok:** Deník → hledat potravinu (full-text + fuzzy, bez ohledu na
  diakritiku) → vybrat → gramáž + typ jídla → *Přidat do deníku*. Denní
  součet kcal a maker se přepočítá.
- **Klíčové pravidlo:** každý záznam má **snapshot** výživy k okamžiku zápisu;
  pozdější změna potraviny historii nemění (T-58, T-59).
- **Offline/nepřihlášen:** vidí ukázkové potraviny, ukládání jen po přihlášení.

### UC-04 Vytvoření vlastní potraviny ✅
- **Aktér:** Uživatel.
- **Tok:** Deník nebo Recepty → při hledání *Vytvořit vlastní* → název +
  hodnoty na 100 g → uloží se jako `source='user'`, viditelná jen jemu, a hned
  se dá zapsat/použít.
- **Práva:** uživatel nesmí vytvořit potravinu se `source='off'` (T-44).

### UC-05 Pitný režim ✅
- **Tok:** Voda → rychlé dávky (200/330/500 ml) nebo vlastní ml → průběh vůči
  dennímu cíli. Cíl pití pochází z výpočtu cíle.

### UC-06 Zápis váhy ✅
- **Tok:** Váha → zadat kg → *Uložit váhu*. Jeden záznam na den (přepisovatelný),
  zobrazí se 7denní průměr.

### UC-07 Fotoanalýza jídla ✅
- **Aktér:** Uživatel.
- **Tok:** Fotka → vybrat fotku → nahraje se do privátního úložiště →
  Edge Function `analyze-photo` (Gemini) vrátí návrh položek s gramáží a
  výživou → uživatel zaškrtá/upraví → *Zapsat vybrané do deníku*.
- **Pravidla:** nikdy se neuloží automaticky; denní limit analýz; při riziku
  vrací srozumitelnou chybu; klíč Gemini jen v Supabase secrets.
- **Model:** volá se přes secret `GEMINI_MODEL` (aktuálně `gemini-flash-lite-latest`).

### UC-08 Vytvoření a uložení receptu ✅
- **Tok:** Recepty → název + počet porcí → přidat ingredience (z databáze nebo
  vlastní potravina) s gramáží → výživa na porci se přepočítá → *Uložit recept*.
  *Zapsat 1 porci do deníku* přenese porci (s vazbou `recipe_id`).

### UC-09 Úprava uloženého receptu ✅
- **Tok:** Recepty → vybrat uložený recept → upravit název/porce/ingredience →
  *Uložit změny* (přepíše tentýž recept). *Nový recept* založí čistý.

### UC-10 Plán jídel a přenos dne do deníku ✅
- **Tok:** Plány jídel → nový plán (název, začátek, 1–4 týdny) → vybrat den →
  přidat potravinu (gramáž) nebo recept (počet porcí) k jídlu → *Přenést den
  do deníku*.
- **Pravidlo F-12:** přenos jen na tlačítko, nikdy automaticky.

### UC-11 Upomínky 🟡
- **Tok:** Upomínky → zapnout → fázovaný rozvrh pití a hlavní jídla, celkem
  nejvýše 8 notifikací denně, neutrální tón.
- **Stav:** logika rozvrhu hotová a testovaná; na webu jen náhled, plánování
  lokálních notifikací běží v mobilní aplikaci. Push týdenní shrnutí ⏳ (UC-19).

### UC-12 Motivace: XP, level, série, nálada 🟡
- **Tok:** za zápis do deníku, vody a váhy se přidělí XP; počítá se level a
  série dní; avatar mění náladu podle stavu dne.
- **Pravidla:** odměna nikdy za omezování; nálada uživatele nehodnotí
  (T-16–T-32). Přidělování odznaků je zatím částečné.

### UC-13 Bezpečnostní eskalace ✅
- **Tok:** při dlouhodobě nízkém příjmu / nízkém BMI se na úvodu zobrazí
  nevyčítavá nabídka pomoci (Anabell). Nehodnotí uživatele.

### UC-14 Export mých dat (GDPR) ✅
- **Tok:** Účet a data → *Stáhnout moje data* → JSON se všemi osobními daty
  (přes RLS, jen vlastní). Sdílené číselníky se neexportují.

### UC-15 Smazání účtu (GDPR) ✅
- **Tok:** Účet a data → *Smazat účet* → dvoukrokové potvrzení → Edge Function
  `delete-account` smaže úložiště, data v tabulkách a nakonec auth účet.
  Nevratné, maže se jen vlastní účet.

### UC-16 Právní dokumenty ✅ (draft)
- **Tok:** odkazy v patičce úvodu → Zásady ochrany údajů / Podmínky používání.
- **Poznámka:** obsah je draft, čeká na doplnění provozovatele a právní revizi.

### UC-17 Přepnutí jazyka ✅
- **Tok:** úvod → přepínač jazyka (cs/sk/en). Zdrojový jazyk je čeština,
  fallback na cs.

### UC-18 Skener čárových kódů ⏳ (F-09)
### UC-19 Týdenní shrnutí push ⏳ (F-13 push, fáze 6)
### UC-20 Generování receptu AI ⏳ (F-11 rozšíření)

---

## Přehled testovací sady

### Automatické jednotkové testy (Vitest) – 144 testů

| Balíček | Testů | Pokrývá | Akcept. testy |
|---|---|---|---|
| `@dietapp/nutrition-calc` | 25 | BMR, TDEE, cíl kcal, makra, voda, věk, bezpečné limity | T-01–T-15, T-70–T-75 |
| `@dietapp/gamification-rules` | 52 | XP, level, série, nálada, odznaky | T-16–T-32 |
| `@dietapp/off-import` | 14 | normalizace/validace potravin, dedup podle barcode | T-33–T-40 |
| `@dietapp/diary` | 6 | snapshot záznamu, výživa receptu na porci, denní součty | T-57–T-61 |
| `@dietapp/analyze-photo` | 14 | autorizace, rate limit, retry, parsování odpovědi | T-48–T-56 |
| `@dietapp/nutrition-analyst` | 10 | detekce eskalace, prahy BMI a příjmu | 8.1 |
| `@dietapp/reminders` | 7 | fázovaný rozvrh pití a jídla, limit 8/den | F-13 |
| `@dietapp/gdpr` | 16 | rozsah osobních dat, pořadí mazání, sestavení exportu | N-06 |

Spuštění: `npm test` (všechny balíčky).

### Testy nad databází – 10 kontrol

| Sada | Kontroly | Pokrývá |
|---|---|---|
| RLS (`npm run test:rls`) | 8 | izolace dat mezi uživateli, zákaz zápisu `foods` se `source='off'`, žádná tabulka bez RLS | T-41–T-47 |
| Snapshot (`npm run test:snapshot`) | 2 | neměnnost historie deníku při změně potraviny | T-58, T-59 |

Spuštění: `npm run test:db` (potřebuje `.env` s připojením k DB).

### Statické kontroly

- `npm run typecheck` – typová kontrola balíčků; `app/` přes `tsc --noEmit`.
- `npm run lint:styles` – žádná přímo zapsaná barva mimo `app/src/theme.ts`.
- `npx expo export --platform web` – ověření sestavení webového bundlu.

---

## Manuální checklist (UI) – místo E2E

Projít po přihlášení (Google). U každého kroku očekávaný výsledek. Slouží
jako smoke test do doby, než vzniknou E2E testy.

| MT | Scénář | Kroky | Očekávaný výsledek |
|---|---|---|---|
| MT-01 | Přihlášení | Úvod → Přihlásit přes Google → souhlas | Úvod ukazuje „Přihlášen: …", data se ukládají |
| MT-02 | Cíl | Nastavit cíl → vyplnit → Spočítat | Zobrazí denní kcal a makra, uloží se |
| MT-03 | Zápis jídla | Deník → „mléko" → vybrat → 250 g → Přidat | Záznam přibude, denní součet naroste |
| MT-04 | Vlastní potravina | Deník → text → Vytvořit vlastní → uložit | Potravina se vybere a jde zapsat |
| MT-05 | Voda | Voda → +330 ml | Průběh vůči cíli naroste |
| MT-06 | Váha | Váha → zadat kg → Uložit | Uloženo, 7denní průměr se aktualizuje |
| MT-07 | Fotka | Fotka → vybrat fotku jídla | Vrátí položky s kcal; po zaškrtnutí zápis do deníku |
| MT-08 | Recept | Recepty → název + ingredience → Uložit recept | Objeví se v „Uložené recepty" |
| MT-09 | Úprava receptu | Recepty → načíst uložený → změnit → Uložit změny | Recept se přepíše (ne nový) |
| MT-10 | Plán | Plány → nový plán → den → přidat položku → Přenést den | Položky se přenesou do deníku |
| MT-11 | Upomínky | Upomínky → zapnout | Web: náhled rozvrhu; mobil: naplánování |
| MT-12 | Motivace | Zapsat jídlo/vodu/váhu | XP/level/série se aktualizují, nálada odpovídá |
| MT-13 | Eskalace | Dlouhodobě nízký příjem | Na úvodu nabídka pomoci (Anabell), bez hodnocení |
| MT-14 | Export | Účet a data → Stáhnout moje data | Stáhne JSON s vlastními daty |
| MT-15 | Smazání účtu | Účet a data → Smazat účet → potvrdit | Účet i data smazány, odhlášení (test. účet!) |
| MT-16 | Právní texty | Úvod → patička → Zásady / Podmínky | Otevřou se čitelné stránky |
| MT-17 | Jazyk | Úvod → přepínač cs/sk/en | Texty se přepnou |

---

## Matice pokrytí (UC ↔ typ testu)

| UC | Jednotkové | DB (RLS/snapshot) | Manuální |
|---|---|---|---|
| UC-01 | – | RLS | MT-01 |
| UC-02 | nutrition-calc | – | MT-02 |
| UC-03 | diary, off-import | RLS, snapshot | MT-03 |
| UC-04 | off-import | RLS | MT-04 |
| UC-05 | – | RLS | MT-05 |
| UC-06 | – | RLS | MT-06 |
| UC-07 | analyze-photo | RLS | MT-07 |
| UC-08 | diary | RLS | MT-08 |
| UC-09 | diary | RLS | MT-09 |
| UC-10 | – | RLS | MT-10 |
| UC-11 | reminders | – | MT-11 |
| UC-12 | gamification-rules | RLS | MT-12 |
| UC-13 | nutrition-analyst | – | MT-13 |
| UC-14 | gdpr | RLS | MT-14 |
| UC-15 | gdpr | RLS | MT-15 |
| UC-16 | – | – | MT-16 |
| UC-17 | – | – | MT-17 |

---

## Co ještě není pokryté (záměrně, MVP)

- **E2E testy (Maestro)** – odloženo, UI se bude předělávat.
- **UC-18 skener čárových kódů**, **UC-19 týdenní push shrnutí**,
  **UC-20 generování receptů AI** – zatím neimplementováno.
- Právní texty čekají na doplnění a revizi (UC-16).
