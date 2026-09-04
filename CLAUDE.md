# Aplikace na hubnutí

Hybridní aplikace (iOS, Android, web) pro deník jídel a hubnutí. Expo plus Supabase plus Gemini.

Zadání je v `docs/zadani.md`. Je závazné, včetně 318 očíslovaných testů. Když se od něj odchýlíš, řekni to a navrhni změnu zadání, neobcházej ho potichu.

## Stack

| Vrstva | Technologie |
|---|---|
| Klient | Expo (React Native + react-native-web), Expo Router |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| AI | Google Gemini, výhradně přes Edge Function |
| Testy | Vitest, pgTAP-style SQL testy, Maestro pro E2E |

Jazyky: čeština je **zdrojový a primární jazyk**. Slovenština a angličtina jsou vydané.

## Skilly jsou závazné

V `.claude/skills/` je sedm skillů. Nejsou to návrhy, jsou to pravidla projektu. Před prací na dané oblasti si příslušný skill přečti.

| Oblast práce | Skill |
|---|---|
| BMR, TDEE, kalorický cíl, makra, pitný cíl | `nutrition-calc` |
| Tabulky, migrace, RLS, dotazy, Storage | `supabase-schema` |
| Obrazovky, komponenty, barvy, texty, i18n | `expo-screen` |
| Import a validace dat o potravinách | `off-import` |
| Volání Gemini, prompty, limity | `gemini-edge-fn` |
| Interpretace dat uživatele, formulace o jídle | `nutrition-analyst` |
| XP, levely, série, odznaky, avatar | `gamification-rules` |

## Pravidla, která se neobcházejí

Tato pravidla jsou v kódu vynucená testy nebo constrainty. Když ti test brání v postupu, **je to záměr**, nikoliv překážka k odstranění.

1. **Kalorický cíl nikdy pod 1200 kcal (ženy) a 1500 kcal (muži).** Vynuceno v `nutrition-calc` i constraintem v databázi.
2. **Žádná tabulka bez RLS.** Test čte metadata Postgresu a selže, pokud tabulka v `public` nemá zapnuté RLS a alespoň jednu politiku.
3. **Historie deníku je neměnná.** `diary_entries.snapshot` je zdroj pravdy. Denní součty se nikdy nepočítají joinem na `foods`.
4. **API klíče jen na serveru.** Nikdy v klientovi, nikdy v `EXPO_PUBLIC_*`, nikdy v repozitáři.
5. **Výstup AI se neukládá bez potvrzení uživatelem.** Fotoanalýza a generované recepty vracejí návrh.
6. **Barva ani text nehodnotí jídlo.** Žádná zelená pro „dobré" a červená pro „špatné", žádné „hřích" a „cheat day". Vynuceno testem nad slovníky.
7. **Odměňuje se zapisování, ne restrikce.** XP za zapsaný den, nikdy za deficit nebo nízký příjem. Vstup pro výpočet XP záměrně neobsahuje kalorie ani váhu, aby je nešlo použít. XP se nikdy neodečítá.
8. **Žádná barva, mezera ani velikost písma napsaná přímo.** Vše z `app/src/theme.ts`. Vynuceno lintem.
9. **Herní mechanika se nezobrazuje při aktivní eskalaci** z `nutrition-analyst`. Toto je jediné pravidlo, které vyžaduje, aby o sobě dvě části kódu věděly, takže se na něj snadno zapomene.

## Struktura

```
CLAUDE.md
docs/zadani.md              závazné zadání s testy
.claude/skills/             sedm skillů, pravidla projektu
.claude/agents/             review agenti
app/                        Expo aplikace
  src/theme.ts              design tokeny
  src/i18n.ts               vícejazyčnost
  src/locales/              cs (zdroj), sk, en
packages/nutrition-calc/    výživové výpočty, test-first
packages/off-import/        import Open Food Facts
packages/nutrition-analyst/  zjištění, mantinely, eskalace
packages/gamification-rules/  XP, série, nálada, odznaky
supabase/migrations/        číslované SQL migrace
supabase/functions/         Edge Functions (Deno)
supabase/tests/             RLS a constrainty
```

## Příkazy

```bash
npm test                      # všechny testy napříč balíčky
npm run lint:styles           # kontrola pevně zapsaných barev a rozměrů
supabase start                # lokální Postgres a služby
supabase/tests/run.sh         # migrace a RLS testy proti čisté databázi
npx expo start                # vývojový server
```

## Postup práce

1. Nová funkce jde vždy podle fáze v zadání, sekce 9. Fáze se nepřeskakují.
2. **Test před implementací** u výživových výpočtů, validace dat a bezpečnostních limitů. U UI to nevyžaduju.
3. Migrace se přidávají jako nový soubor. Existující migrace se nikdy nemění.
4. Fáze je hotová, až projdou testy, které má v zadání u sebe uvedené.
5. Commit message česky, imperativ, jeden logický celek na commit.

## Co dělat, když si nejsi jistý

Zeptej se. Tenhle projekt má hodně vzájemně navázaných pravidel a odhad je tady dražší než jedna otázka. Konkrétně se vždy zeptej u:

- změny bezpečnostních limitů nebo jejich kontrol
- formulace jakéhokoliv textu o jídle, váze nebo pokroku uživatele
- nové tabulky nebo změny RLS
- čehokoliv, co se dotýká rizikových vzorců a eskalace v `nutrition-analyst`
- nové odměny, odznaku nebo nálady avatara
