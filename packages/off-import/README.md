# @dietapp/off-import

Normalizace a validace dat o potravinách z Open Food Facts (F-03).
**Stav: hotovo** (fáze 2), testy T-33 až T-40 procházejí.

Obsah:
- `validate.ts` – `normalizeFood`: zahodí záznam bez názvu/kcal, s kcal mimo
  0–900, s makrem mimo 0–100, se součtem maker nad 105 g, s Atwaterovou
  odchylkou nad 25 %, nebo s kcal > 0 a nulovými makry; název zkrátí na 200.
- `dedupe.ts` – `dedupeByBarcode` (při shodném barcode ponechá nejúplnější
  záznam) a `importFoods` (celá dávková pipeline).

Spuštění: `npm test --workspace @dietapp/off-import`.
