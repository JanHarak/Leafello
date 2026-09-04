# @dietapp/nutrition-calc

Výživové výpočty z F-06 se závaznými bezpečnostními limity. **Stav: hotovo**
(fáze 0), testy T-01 až T-15 a T-70 až T-75 procházejí.

Obsah:
- `bmr.ts` – BMR (Mifflin-St Jeor, nezaokrouhlený), TDEE, věk z data narození.
- `goal.ts` – kalorický cíl s hranicemi 1200/1500 kcal, makra se stropy 35/30,
  pitný cíl, kontrola cílové váhy (BMI ≥ 18,5).
- `errors.ts` – `RateOutOfRange`, `TargetWeightUnsafe`, `HeightOutOfRange`,
  `InvalidBirthDate`.

Bezpečnostní limity nejsou volitelné. Když ti test brání v postupu, je to
záměr. Spuštění: z kořene `npm test --workspace @dietapp/nutrition-calc`.
