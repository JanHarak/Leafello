# Databáze jídel – zdroje a plnění

Přehled toho, odkud se berou potraviny v tabulce `foods`, jak je doplnit a co
zbývá udělat.

## Zdroje (`foods.source`)

| Zdroj | Význam | Viditelnost (RLS) | Řazení |
|-------|--------|-------------------|--------|
| `curated` | Kurátorský základ generických **českých** surovin (kuřecí prsa, rýže, jablko…). Hodnoty na 100 g z USDA (public domain) + obalů, české názvy a porce vlastní. `is_verified=true`. | čte každý přihlášený | první (ověřené) |
| `usda` | Generické potraviny z USDA FoodData Central (public domain), názvy přeložené do češtiny. `is_verified=true`. | čte každý přihlášený | první (ověřené) |
| `nidb` | Generické české potraviny z NutriDatabáze.cz (ÚZEI), oficiální registrovaný export. České názvy, ~1136 položek. `is_verified=true`. Atribuce povinná (patička). | čte každý přihlášený | první (ověřené) |
| `off` | Balené produkty z Open Food Facts (ODbL). | čte každý přihlášený | za kurátorskými |
| `user` | Vlastní potraviny uživatele. | jen vlastník | dle shody |
| `ai` | Odhad z fotoanalýzy (Gemini). | jen vlastník | dle shody |

Zápis `curated` i `off` smí jen service role (skripty přes přímé DB spojení),
běžný uživatel je přes RLS podstrčit nemůže (migrace `0011`).

## Filtr kvality

`scripts/lib/food-quality.mjs` – sdílený pro oba OFF importy. Zahazuje názvy
s emoji, převážně nelatinkové (azbuka, CJK…), útržky („1/2 Beutel …"), prázdné
a příliš dlouhé. Preferuje český název (`product_name_cs` → `sk` → `en`).

## Jak doplnit data

Vše bere DB z `.env` (`SUPABASE_DB_URL` / `SUPABASE_DB_PASSWORD`).

### 1. Kurátorský český základ (hotovo, ~106 položek)
Data: `data/curated-foods.cs.json`. Idempotentní (klíč `external_id` = slug).
Úprava/rozšíření = editovat JSON a spustit znovu.
```
npm run seed:curated
```

### 2. OFF – rychlý API import (stovky nejskenovanějších)
```
npm run import:off -- --limit=800 --countries=en:czech-republic,en:slovakia
```

### 3. OFF – hromadný data dump (tisíce, doporučeno pro škálu)
Streamuje oficiální dump řádek po řádku (nezáleží na velikosti souboru),
filtruje CZ/SK, čistí a validuje. Dump má ~10+ GB (gz), sken projede miliony
produktů – počítej s desítkami minut podle připojení.

Přímo z URL (nic se neukládá na disk):
```
npm run import:off:dump -- --limit=20000
```
Z předem staženého souboru (rychlejší při opakování; stáhni
`https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz`):
```
npm run import:off:dump -- --file=./openfoodfacts-products.jsonl.gz --limit=20000
```
Volby: `--countries=`, `--batch=`, `--limit=`.

### 4. USDA generické potraviny (public domain, s překladem)
Stáhni dataset z <https://fdc.nal.usda.gov/download-datasets> – **SR Legacy** nebo
**Foundation Foods** ve formátu **JSON** (public domain, tisíce generických
potravin). Názvy se dávkově přeloží do češtiny přes Gemini – do `.env` přidej
`GEMINI_API_KEY` (a volitelně `GEMINI_MODEL`). Bez klíče proběhne import
s anglickými názvy (přeložíš později – překlady se cachují v
`data/usda-name-cache.json`).
```
npm run import:usda -- --file=./FoodData_Central_sr_legacy_food_json_2018-04.json
```
Pozn.: u USDA se NEuplatňuje přísná Atwaterova kontrola (jinak by vypadla
vlákninou bohatá zelenina), jen kontrola rozsahů hodnot.

### 5. NutriDatabáze.cz (ÚZEI) – hotovo (~1136 položek)
Národní databáze složení potravin, generické české suroviny (EuroFIR). Import
z **oficiálního registrovaného exportu** (registrace zdarma). Užití se řídí
licencí NutriDatabaze.cz a databáze je chráněná autorským zákonem (121/2000
Sb.) – **atribuce je povinná** a je v patičce appky (`attribution.nutridb`).

Formát exportu: CSV, středník, kódování **Windows-1250**, hodnoty na 100 g,
desetinná tečka. Importer to řeší sám.
```
npm run import:nutridb -- --file=./data/NutriDatabaze-v11.26-data-export.csv
```
Sacharidy se berou jako **dostupné** (`CHO`, bez vlákniny, jako na EU etiketě),
vláknina zvlášť (`FIBT`), sůl z `NACL` (fallback z `NA`).

## Zbývající licencovaný zdroj (NELZE jen tak importovat)

- **FÉR potravina** (dříve Nutriatlas) – největší CZ databáze (~34,6 tis.
  značkových), data přes **placené** CSV/API. Nutná komerční smlouva; bez ní
  nescrapujeme.

## Co zbývá / roadmapa

- [ ] **Spustit ostrý dump import** (krok 3) a případně doladit filtr kvality
      podle reálného výstupu (kolik CZ/SK produktů projde).
- [ ] **USDA generické potraviny** – import ~tisíců generických položek z USDA
      FoodData Central (public domain, výborná výživa i porce). Anglické názvy
      → nutná lokalizace do češtiny (lze dávkově přes Gemini). Alternativně
      slouží jako zdroj čísel pro rozšíření kurátorského základu.
- [ ] **Výběr porce v UI** – `food_servings` už se plní (kurátorská data mají
      „1 vejce", „1 plátek", „1 hrnek"…), ale appka je zatím při zápisu jídla
      nezobrazuje. Doplnit rychlý výběr porce vedle zadání gramů.
- [ ] **Přečištění stávajících OFF řádků** – filtr kvality běží nově jen při
      importu; jednorázově projet i 595 existujících záznamů (emoji, cizí
      jazyk) a případně smazat balast.
- [ ] **Porce z OFF dumpu** – `serving_size` / `serving_quantity` z dumpu zatím
      neukládáme; u balených produktů by šlo doplnit do `food_servings`.
