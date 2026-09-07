/**
 * Právní texty pro zobrazení v aplikaci. Zrcadlí docs/legal/*.md (zdroj pravdy);
 * když se změní tam, aktualizuj i sem. Zatím pouze v češtině (draft).
 */

export const PRIVACY_MARKDOWN = `# Zásady ochrany osobních údajů

> DRAFT – není právní rada. Před vydáním nech zkontrolovat právníkem. Placeholdery [...] je potřeba doplnit.

Provozovatel (správce): [Název provozovatele]
Kontakt: [kontaktní e-mail]
Účinnost od: [datum]

## 1. Úvod
Tyto zásady popisují, jaké osobní údaje aplikace zpracovává, proč a jaká máš práva. Aplikace je deník jídel a hubnutí. Není zdravotnickým prostředkem.

## 2. Jaké údaje zpracováváme
- **Přihlašovací:** e-mail, identifikátor účtu.
- **Profil:** pohlaví, datum narození, výška, úroveň aktivity, cílová váha, tempo.
- **Zdraví a životospráva:** hmotnost, zapsaná jídla a jejich výživové hodnoty, pití, vypočtené cíle. Část může být údajem o zdraví (zvláštní kategorie dle čl. 9 GDPR).
- **Fotografie jídel:** při fotoanalýze se fotka nahraje do úložiště a odešle poskytovateli AI.
- **Technické údaje:** typ zařízení, chybové záznamy, základní metriky.

## 3. Účely a právní základ
- Poskytování funkcí (účet, deník, výpočty) – plnění smlouvy (čl. 6/1/b).
- Údaje o zdraví a fotoanalýza – tvůj výslovný souhlas (čl. 9/2/a).
- Zabezpečení a ladění chyb – oprávněný zájem (čl. 6/1/f).
- Plnění právních povinností – právní povinnost (čl. 6/1/c).

Souhlas můžeš kdykoliv odvolat; nemá to vliv na zákonnost dřívějšího zpracování.

## 4. Zpracovatelé
- **Supabase** – hosting, autentizace, úložiště.
- **Google (Gemini)** – rozpoznání jídla z fotky.
- **Google** – volitelné přihlášení účtem.
- **[Sentry]** – chybová hlášení bez citlivých údajů.

Někteří zpracovatelé mohou zpracovávat údaje mimo EU/EHP na základě standardních smluvních doložek.

## 5. Fotografie jídel
Fotku odesíláš dobrovolně kvůli odhadu. Výsledek je odhad, ne měření, a neuloží se bez tvého potvrzení. Fotky jsou soukromé a mažou se spolu s účtem.

## 6. Doba uchování
Údaje uchováváme po dobu trvání účtu. Po smazání účtu je smažeme i s fotkami nejpozději do 30 dnů, není-li zákonná povinnost jinak.

## 7. Tvoje práva
Máš právo na přístup, opravu, výmaz, omezení, přenositelnost, námitku a odvolání souhlasu. Export dat i smazání účtu máš přímo v aplikaci. Můžeš podat stížnost u Úřadu pro ochranu osobních údajů (www.uoou.cz).

## 8. Zabezpečení
Přístup omezený na vlastníka dat, šifrované spojení, klíče mimo klientskou aplikaci.

## 9. Děti
Aplikace není určena osobám mladším [15/16] let.

## 10. Změny
Zásady můžeme aktualizovat; o podstatných změnách budeme informovat v aplikaci.

## 11. Zdroje dat
Data o potravinách: Open Food Facts (© Open Food Facts contributors, licence ODbL).

## 12. Kontakt
Dotazy: [kontaktní e-mail].`;

export const TERMS_MARKDOWN = `# Podmínky používání

> DRAFT – není právní rada. Před vydáním nech zkontrolovat právníkem. Placeholdery [...] je potřeba doplnit.

Provozovatel: [Název provozovatele]
Kontakt: [kontaktní e-mail]
Účinnost od: [datum]

## 1. Předmět
Aplikace je deník jídel a hubnutí s podporou AI. Používáním souhlasíš s těmito podmínkami.

## 2. Není zdravotnický prostředek
Aplikace slouží k vedení deníku a orientačním výpočtům. Není zdravotnickým prostředkem, nenahrazuje lékaře ani nutričního terapeuta a neposkytuje diagnózu ani léčbu. Při zdravotních potížích se poraď s odborníkem. Aplikace uplatňuje bezpečnostní limity a při rizikovém vzorci nabídne odbornou pomoc.

## 3. Účet
K části funkcí je potřeba účet. Odpovídáš za zabezpečení přihlášení a aktivitu pod svým účtem. Účet můžeš kdykoliv smazat.

## 4. Přijatelné užití
Nezneužívej aplikaci, neobcházej zabezpečení, nenahrávej cizí ani protiprávní obsah a používej ji jen pro osobní, nekomerční účel.

## 5. Umělá inteligence
Rozpoznání jídla z fotky a generované návrhy jsou orientační odhady, ne měření. Nic se neuloží bez tvého potvrzení. Nespoléhej na výstupy AI jako na jediný zdroj rozhodování o zdraví.

## 6. Obsah třetích stran
Data o potravinách pocházejí z Open Food Facts (licence ODbL) a mohou obsahovat nepřesnosti.

## 7. Dostupnost a změny
Aplikaci můžeme upravovat či ukončit. Podmínky můžeme měnit; o podstatných změnách budeme informovat v aplikaci.

## 8. Omezení odpovědnosti
V rozsahu povoleném zákonem neodpovídáme za škody vzniklé používáním aplikace, zejména za rozhodnutí na základě orientačních výpočtů a odhadů. Aplikace je poskytována „tak, jak je".

## 9. Ukončení
Podmínky můžeme ukončit nebo pozastavit přístup při jejich porušení. Po smazání účtu se data odstraní dle Zásad ochrany osobních údajů.

## 10. Rozhodné právo
Podmínky se řídí právem [České republiky]; spory řeší příslušné soudy [ČR].

## 11. Kontakt
Dotazy: [kontaktní e-mail].`;
