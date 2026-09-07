# Zásady ochrany osobních údajů

> **DRAFT – není právní rada.** Tato šablona vychází z běžné praxe a GDPR,
> ale před vydáním ji musí zkontrolovat právník. Doplň placeholdery `[…]`.

**Provozovatel (správce):** [Název provozovatele / firma, IČO, adresa]
**Aplikace:** [Název aplikace]
**Kontakt:** [kontaktní e-mail]
**Účinnost od:** [datum]

## 1. Úvod

Tyto zásady popisují, jaké osobní údaje aplikace [Název aplikace] („aplikace")
zpracovává, proč, na jakém právním základě a jaká máš práva. Aplikace je deník
jídel a hubnutí. **Není zdravotnickým prostředkem** a neposkytuje lékařská ani
dietologická doporučení.

## 2. Jaké údaje zpracováváme

- **Identifikační a přihlašovací:** e-mailová adresa (přihlášení přes e-mailový
  odkaz nebo Google), identifikátor účtu.
- **Profil:** pohlaví, datum narození, výška, úroveň aktivity, cílová váha, tempo.
- **Údaje o zdraví a životosprávě:** tělesná hmotnost, zapsaná jídla a jejich
  výživové hodnoty, pitný režim, vypočtené cíle. Část z nich může být považována
  za **údaje o zdraví** (zvláštní kategorie podle čl. 9 GDPR).
- **Fotografie jídel:** pokud použiješ fotoanalýzu, fotku nahráváš do úložiště a
  posílá se ke zpracování poskytovateli AI (viz čl. 4).
- **Technické údaje:** typ zařízení a operačního systému, chybové a diagnostické
  záznamy, základní metriky používání.

## 3. Účely a právní základ zpracování

| Účel | Právní základ |
|---|---|
| Poskytování funkcí aplikace (účet, deník, výpočty cílů) | Plnění smlouvy (čl. 6/1/b) |
| Zpracování údajů o zdraví a fotoanalýza | Tvůj výslovný souhlas (čl. 9/2/a) |
| Zabezpečení, prevence zneužití, ladění chyb | Oprávněný zájem (čl. 6/1/f) |
| Plnění právních povinností | Právní povinnost (čl. 6/1/c) |

Souhlas můžeš kdykoliv odvolat; odvolání nemá vliv na zákonnost dřívějšího
zpracování.

## 4. Zpracovatelé a předání údajů třetím stranám

Údaje nezveřejňujeme. Zapojujeme tyto zpracovatele:

- **Supabase** – hosting databáze, autentizace a úložiště souborů. [Region, DPA.]
- **Google (Gemini API)** – rozpoznání jídla z fotky. Fotka se odesílá ke
  zpracování; podle nastavení poskytovatele může být dočasně uchována. [Odkaz na
  podmínky.]
- **Google (přihlášení)** – volitelné přihlášení účtem Google.
- **[Sentry / jiný nástroj]** – sběr chybových hlášení (bez obsahu fotek a bez
  citlivých údajů).

Někteří zpracovatelé mohou zpracovávat údaje mimo EU/EHP. V takovém případě se
předání opírá o standardní smluvní doložky nebo jiný vhodný mechanismus.

## 5. Fotografie jídel

Fotku odesíláš dobrovolně kvůli odhadu výživových hodnot. Výsledek je **odhad,
nikoliv měření** a **neuloží se do deníku bez tvého potvrzení**. Fotky se ukládají
soukromě (přístup jen k tvým souborům) a mažou se spolu s účtem.

## 6. Doba uchování

Údaje uchováváme po dobu trvání účtu. Po smazání účtu smažeme tvé údaje i fotky
**nejpozději do 30 dnů**, s výjimkou případů, kdy nám je zákon ukládá uchovat déle.

## 7. Tvoje práva

Máš právo na přístup, opravu, výmaz, omezení zpracování, přenositelnost, vznesení
námitky a odvolání souhlasu. Přístup ke svým údajům, jejich **export (JSON)** i
**smazání účtu** máš přímo v aplikaci. Máš také právo podat stížnost u dozorového
úřadu (v ČR **Úřad pro ochranu osobních údajů**, www.uoou.cz).

## 8. Zabezpečení

Používáme přístup omezený na vlastníka dat (řízení přístupu na úrovni databáze),
šifrované spojení a uchování přístupových klíčů mimo klientskou aplikaci.

## 9. Děti

Aplikace není určena osobám mladším [15 / 16] let. Vědomě neshromažďujeme údaje
dětí pod touto hranicí.

## 10. Změny

Zásady můžeme aktualizovat. O podstatných změnách tě budeme informovat v aplikaci
a aktualizujeme datum účinnosti.

## 11. Zdroje dat

Data o potravinách pocházejí z databáze **Open Food Facts** (© Open Food Facts
contributors, licence ODbL).

## 12. Kontakt

Dotazy k ochraně údajů: [kontaktní e-mail].
