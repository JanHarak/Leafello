---
name: gamification-rules
description: XP, levely, série dní, odznaky a nálada avatara pro aplikaci na hubnutí. Použij tento skill vždy, když se pracuje s motivací a odměnami: přidělování bodů, výpočet levelu, série zapsaných dní, odznaky, postava avatara a její nálady, oslavné animace, nebo jakákoliv zpětná vazba na pokrok uživatele. Použij ho i tehdy, když uživatel jen říká "přidej body za X", "ať to uživatele odmění" nebo "udělej to hravější", protože existují věci, za které se v této aplikaci odměňovat nesmí, a hranice je nutné znát předem.
---

# gamification-rules

XP, levely, série a avatar. Účelem herní mechaniky je **udržet návyk vést deník**, nic jiného.

## Nejdůležitější pravidlo

**Odměňuje se zapisování, ne restrikce.**

| Odměňuje se | Nikdy se neodměňuje |
|---|---|
| zapsaný den | kalorický deficit |
| splněný pitný cíl | nízký příjem |
| zvážení se | „nulový den" |
| dokončený týden | rychlost hubnutí |
| vytvořený recept | zhubnuté kilogramy |

Za překročení cíle se **nikdy neodečítá.** `addXp` vyhodí výjimku při záporném přírůstku, protože trest za jídlo je přesně ten mechanismus, kterému se v této aplikaci vyhýbáme.

Rozdíl mezi oběma sloupci není kosmetický. První buduje návyk vést deník, druhý odměňuje restrikci a u části uživatelů spustí nezdravé chování.

## Jak je to pravidlo vynucené

Dvě věci, které dělají z pravidla něco víc než komentář:

**Vstup pro výpočet XP záměrně neobsahuje kalorie.** `DayActivity` má jen `mealsLogged`, `waterGoalMet`, `weighedIn`, `recipesCreated` a `streakDays`. Co není ve vstupu, to nemůže ovlivnit výsledek. Kdyby tam kcal byly, dřív nebo později je někdo použije s nejlepším úmyslem a odůvodněním, že si to uživatelé přejí. Test kontroluje i názvy klíčů.

**Typ `AchievementTrigger` neobsahuje spouštěč typu deficit ani zhubnutých kilogramů**, takže takový odznak neprojde kompilací. `weigh_ins_total` počítá **počet vážení**, nikdy naměřenou hodnotu ani její změnu.

## XP a levely

| Odměna | XP |
|---|---|
| `logged_day` (alespoň 2 jídla) | 20 |
| `water_goal` | 10 |
| `weigh_in` | 5 |
| `full_week` | 50 |
| `recipe_created` | 15 za recept |

Bonus za celý týden přijde, když série dosáhne násobku sedmi. Ne za kalendářní týden: uživatel, který začne ve středu, si na bonus nemá čekat do neděle.

**Levely:** `threshold(L) = 50 · L · (L + 1)`. L1 = 100, L2 = 300, L3 = 600, L4 = 1000.

Kvadratický růst znamená, že první levely přijdou rychle a další se prodlužují. Lineární křivka by po měsíci dávala level 30 a číslo by přestalo něco znamenat.

`levelForXp` používá uzavřený vzorec s odmocninou, což má na hranicích riziko chyby v plovoucí čárce. Test to proto prochází pro prvních 200 levelů a kontroluje hodnotu na hranici i o jedno XP pod ní. Když vzorec měníš, ten test nech.

## Série dní

Série má motivovat, ne trestat. Brutální série, která se po jednom zapomenutém dni vynuluje, vede k tomu, že uživatel appku smaže. Zapomenutý den je nejčastěji dovolená nebo nemoc, ne ztráta motivace, a vynulovat za to dva měsíce práce je nespravedlivé.

Proto **jedna automatická záchrana za kalendářní měsíc.**

Chování podle mezery od posledního zapsaného dne:

| Mezera | Co se stane |
|---|---|
| 0 dní | den už byl zpracovaný, nic se nemění |
| 1 den | série pokračuje |
| 2 dny (jeden vynechaný) | použije se záchrana, pokud je |
| 3 a víc dní | série začíná od jedničky |

**Záchrana se nepoužívá na delší mezery.** Kdo nezapisoval týden, tomu jedna záchrana sérii nezachrání a předstírat to by bylo nepoctivé.

Záchrana je automatická, uživatel o ni nežádá. Nabídnout „chceš použít záchranu?" by z ní udělalo rozhodnutí, které někdo bude litovat.

## Nálada avatara

Postava reaguje na to, jestli uživatel zapisuje a pije, **nikdy na to, kolik snědl v absolutním smyslu ani jak mu jde hubnutí.**

Konkrétně: neexistuje nálada „nespokojený" ani „zklamaný". Nálada, která uživatele hodnotí, je výtka obrázkem, a ta je horší než výtka textem, protože se před ní nedá zavřít oči.

Pořadí vyhodnocení, první platné pravidlo vyhrává:

| Podmínka | Nálada |
|---|---|
| právě získán level nebo odznak | `celebrating` |
| dnes žádný záznam a je po 12:00 | `sleepy` |
| u proběhlé připomínky na jídlo chybí zapsaný chod (> 100 kcal) a kalorie jsou pod 90 % | `hungry` |
| vypito míň, než pitný plán do teď čeká (součet porcí proběhlých slotů) | `thirsty` |
| jinak | `happy` |

**Odchylka od původního zadání:** `celebrating` je vyhodnocené první, ne předposlední. V zadání bylo pod hladem a žízní, což znamenalo, že uživatel, který si právě odemkl level v sedm večer s nesplněným pitným cílem, uvidí žíznivou postavu místo oslavy. Oslava je krátkodobá a nikoho neochudí o připomínku pití, ta přijde za minutu sama. Zadání jsem podle toho upravil.

**Jídlo má přednost před pitím.** Deník jídel je hlavní účel aplikace, proto se `hungry` vyhodnocuje před `thirsty`. Když je uživatel pozadu s jídlem i pitím, avatar připomene nejdřív jídlo.

**Žízeň je připomínka po fázích pitného plánu**, stejně jako hlad. Sečte se, kolik ml mají „naordinovat" pitné připomínky, které už dnes pinkly (`MoodContext.waterExpectedMl` z `waterSchedule`). Když má uživatel vypito míň, žízní; jakmile porci dožene – nebo pije napřed a má náskok – žízeň zmizí, dokud další slot očekávané množství nezvýší.

**Hlad je připomínka po chodech, ne trest.** U každé jídelní připomínky (snídaně / oběd / večeře), která už dnes pinkla, avatar zhladoví, pokud na daný chod není zapsané jídlo nad 100 kcal (drobnost hlad neuspokojí). Jakmile uživatel chod zapíše, hlad u té fáze zmizí – do další připomínky. **Nad 90 % kalorického cíle se hlad nikdy nezobrazí**, aby avatar netlačil uživatele k přejídání (pořád platí: příjem se neodměňuje ani nevynucuje). Vše je podíl z cíle, nikdy absolutní příjem – nálada dál nehodnotí, kolik uživatel snědl, jen jestli si zapsal.

`ACTIONABLE_MOODS` říká, u kterých nálad má UI připojit tlačítko. U `happy` a `celebrating` není co dělat, takže tam tlačítko nepatří.

## Vizuální jazyk

Pravidla platí i pro obrázky, ne jen pro čísla.

- **Žádné konfety za splnění kalorického cíle.** Odměna za splnění cíle je odměna za restrikci. Oslavuje se level a odznak, tedy zapisování.
- Nálady jako animované stavy přes Rive, fallback sada SVG pro web. Ne Lottie, u interaktivních stavů se s tím natrápíš.
- Vlastní originální postava. Zákaz avokáda a jiných maskot konkurenčních aplikací.

## Struktura

Skill drží **jen pravidlo a vysvětlení**, ne knihovnu. Implementace žije
v balíčku, aby nevznikly dvě kopie stejné logiky.

```
.claude/skills/gamification-rules/
└── SKILL.md             tento soubor: pravidla a jejich zdůvodnění

packages/gamification-rules/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts         veřejné API balíčku
│   ├── xp.ts            odměny, levely, postup
│   ├── streak.ts        série s měsíční záchranou
│   ├── mood.ts          nálada avatara
│   └── achievements.ts  katalog odznaků s typovým omezením
└── tests/               52 testů, včetně T-16 až T-32 ze zadání
```

Spuštění testů: z kořene repozitáře `npm install && npm test`, nebo
`npm test --workspace @dietapp/gamification-rules` jen pro tento balíček.

## Co do tohoto skillu nepatří

- Výživové výpočty a cíle. To je `nutrition-calc`. Tady se cíl používá jen jako podíl, nikdy jako zdroj odměny.
- Texty a popisky nálad i odznaků. Moduly vracejí klíče do slovníku, text skládá `expo-screen`.
- Interpretace dat a doporučení. To je `nutrition-analyst`, který má vlastní eskalační pravidla. **Když je eskalace aktivní, herní mechanika se nezobrazuje**, protože oslava série někomu, kdo pět dní jí pod polovinou cíle, je to poslední, co potřebuje.
- Tabulky `avatar_state`, `achievements` a `user_achievements`. To je `supabase-schema`.
