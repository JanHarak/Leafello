# Vlákna diskuze a rozdělení práce

## Kam co patří

| Rozhraní | K čemu |
|---|---|
| **Claude Code** | Psaní kódu, migrace, testy, spouštění, git, ladění. Má souborový systém a terminál. |
| **Tato aplikace** | Rozhodnutí, návrh, otevřené otázky, revize, texty, právní věci. |

Rozdělení není o schopnostech, ale o tom, co je pro dané rozhraní snadné. Claude Code umí spustit test a zjistit, že padá. Tato konverzace zvládne lépe dlouhou úvahu o monetizaci, protože se k ní vrátíš za týden a máš ji celou před sebou.

Špatný vzorec, kterému se vyhni: rozhodovat o produktu uvnitř Claude Code v průběhu implementace. Skončí to tím, že důležité rozhodnutí je pohřbené v transkriptu a nikdo neví, proč je to tak, jak to je.

## Vlákna

Šest vláken. První tři jsou aktivní hned, další tři až budou potřeba.

### A. Produkt a monetizace `aktivní`

Otevřené otázky 1, 2 a 5 ze zadání. Co je za paywallem, jak se verifikují uživatelské potraviny, jméno a ochranná známka.

Blokuje: limity ve `gemini-edge-fn`, tedy fázi 4.

Konkrétní návrh, ze kterého se dá začít: 3 fotoanalýzy denně zdarma, výš v placeném tarifu. Tři odpovídají snídani, obědu a večeři, takže free tarif je použitelný a placený má jasnou hodnotu.

### B. Avatar a herní mechanika `aktivní`

Jméno a podoba postavy, konkrétní kresba pěti nálad, výběr mezi Rive a sadou SVG. Otevřená otázka 4.

Pravidla už hotová nejsou k diskuzi: skill `gamification-rules` je napsaný a otestovaný, včetně XP, levelů, série se záchranou a nálad. Tohle vlákno řeší jen výtvarnou podobu.

Vstupní podmínky: vlastní originální postava, ne avokádo. Žádná nálada, která uživatele hodnotí. Žádné konfety za splnění kalorického cíle.

Blokuje: fázi 6.

### C. Implementace fáze 0 a 1 `aktivní, Claude Code`

Repozitář, Supabase projekt, Expo skeleton, auth, onboarding, výpočet cílů. Hotovo, až projdou testy T-01 až T-15 a T-41 až T-47.

Tady se ukáže, jestli se skilly v praxi doplňují tak, jak předpokládám. Papírová architektura vydrží přesně do prvního commitu.

### D. Právo a compliance `později`

ODbL a atribuce, GDPR (export a smazání účtu), formulace „není medicínský prostředek", a pravidla App Store a Google Play pro zdravotní aplikace. To poslední je potřeba vyřešit **před** prvním odesláním k review, ne po odmítnutí.

### E. Rozpočet a provoz `později`

Strop na Gemini, odhad nákladů na uživatele, monitoring metrik ze `references/gemini.md`, hosting a CI.

Váže se na vlákno A, bez rozhodnutí o monetizaci se nedá spočítat, kolik si můžeš dovolit.

### F. Obsah `později`

Kurátorská sada receptů, texty onboardingu, popisky úrovní aktivity. Fáze 5.

## Jak vlákna vést v této aplikaci

Založ **Project** a nahraj do něj `docs/zadani.md`. Projekt drží kontext napříč konverzacemi, takže nemusíš zadání vysvětlovat v každém vlákně znovu.

Pak jednu konverzaci na vlákno, pojmenovanou podle písmene: „A: Monetizace", „B: Avatar". Až se vlákno uzavře, výsledek zapiš do `docs/rozhodnuti/` v repozitáři, ne do transkriptu. Konverzace je pracovní prostor, repozitář je paměť.

Nezakládej vlákno na každou drobnost. Tři aktivní vlákna jsou maximum, které se dá rozumně držet v hlavě.

## Jak vést paralelní práci v Claude Code

Vlákno C je jedno, ale implementace se dá paralelizovat. Dvě věci, které se navzájem nemíchají, můžou běžet zvlášť:

```bash
git worktree add ../hubnuti-schema feature/schema
git worktree add ../hubnuti-onboarding feature/onboarding
```

Každý worktree je samostatná složka se stejnou historií, takže v každém spustíš vlastní session a nepřepisujete si soubory. Skilly a `CLAUDE.md` se načtou v obou, protože jsou v repozitáři.

Co paralelizovat nemá smysl: cokoliv, co se dotýká stejného souboru. Migrace a RLS politiky drž v jednom vlákně, jinak se ti sejde dvě migrace se stejným číslem.

## Co udělat teď, v tomto pořadí

1. Vytvoř repozitář a nakopíruj do něj `CLAUDE.md`, `docs/zadani.md`, `.claude/skills/` a `.claude/agents/`.
2. Přesuň kód ze skillů do balíčků, viz níže. Tohle udělej **před** prvním commitem funkcionality.
3. V Claude Code otevři repozitář a řekni `/doctor`, ať se ověří, že se skilly načetly.
4. Založ vlákno A tady v aplikaci. Rozhodnutí o monetizaci potřebuješ dřív, než se dostaneš k fázi 4.
5. Začni fázi 0 v Claude Code.

## Skilly versus kód: co s tím

Sedm skillů, které jsem napsal, obsahuje i implementaci. To bylo užitečné pro vývoj a ověření, ale **v repozitáři to takhle nechat nejde**. Vznikly by dvě kopie výživových formulí, což je přesně to, před čím `nutrition-calc` sám varuje.

Rozděl to takto:

| Ze skillu | Kam v repozitáři |
|---|---|
| `nutrition-calc/src`, `tests` | `packages/nutrition-calc/` |
| `off-import/src`, `tests`, `scripts` | `packages/off-import/` |
| `expo-screen/src`, `components` | `app/src/`, `app/components/` |
| `gemini-edge-fn/src`, `functions` | `supabase/functions/` a `supabase/functions/_shared/` |
| `nutrition-analyst/src`, `tests` | `packages/nutrition-analyst/` |
| `gamification-rules/src`, `tests` | `packages/gamification-rules/` |
| `supabase-schema/migrations`, `tests`, `scripts` | `supabase/migrations/`, `supabase/tests/` |

Ve `.claude/skills/` zůstane **jen `SKILL.md` a `references/`**. Skill je pravidlo a vysvětlení, ne knihovna. V SKILL.md pak uprav odkazy na nové cesty, jinak bude Claude Code hledat soubory, které tam nejsou.

Tohle je nudná práce na dvacet minut, kterou se vyplatí udělat hned. Za měsíc už budou dvě verze formulí a jedna z nich bude tichá chyba.
