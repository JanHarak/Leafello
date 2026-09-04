/**
 * Výpočty deníku.
 *
 * Klíčová zásada: snapshot se počítá při zápisu a je zdroj pravdy. Denní
 * součty se počítají ze snapshotů, nikdy z aktuálních potravin, aby pozdější
 * změna potraviny nezměnila historii (T-58, T-59).
 */

export interface Per100g {
  kcal: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number | null;
}

export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

/** Výživa záznamu z hodnot na 100 g a gramáže. Nezaokrouhluje se. */
export function entrySnapshot(per100g: Per100g, grams: number): Nutrition {
  const factor = grams / 100;
  return {
    kcal: per100g.kcal * factor,
    protein: (per100g.protein ?? 0) * factor,
    carbs: (per100g.carbs ?? 0) * factor,
    fat: (per100g.fat ?? 0) * factor,
    fiber: (per100g.fiber ?? 0) * factor,
  };
}

export interface RecipeIngredient {
  per100g: Per100g;
  grams: number;
}

/** Výživa receptu na jednu porci: součet ingrediencí dělený počtem porcí. */
export function recipePerPortion(ingredients: RecipeIngredient[], servings: number): Nutrition {
  if (!Number.isFinite(servings) || servings <= 0) {
    throw new Error(`Počet porcí musí být kladné číslo, dostal jsem ${servings}.`);
  }
  const total = ingredients.reduce<Nutrition>(
    (acc, ing) => {
      const n = entrySnapshot(ing.per100g, ing.grams);
      acc.kcal += n.kcal;
      acc.protein += n.protein;
      acc.carbs += n.carbs;
      acc.fat += n.fat;
      acc.fiber += n.fiber;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
  return {
    kcal: total.kcal / servings,
    protein: total.protein / servings,
    carbs: total.carbs / servings,
    fat: total.fat / servings,
    fiber: total.fiber / servings,
  };
}

export interface DailyTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  entries: number;
}

/**
 * Denní součty ze snapshotů, zaokrouhlené na celé jednotky – stejně jako
 * databázový pohled `v_daily_totals`.
 */
export function dailyTotals(snapshots: Array<Partial<Nutrition>>): DailyTotals {
  const sum = snapshots.reduce(
    (acc, s) => {
      acc.kcal += s.kcal ?? 0;
      acc.protein += s.protein ?? 0;
      acc.carbs += s.carbs ?? 0;
      acc.fat += s.fat ?? 0;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return {
    kcal: Math.round(sum.kcal),
    protein: Math.round(sum.protein),
    carbs: Math.round(sum.carbs),
    fat: Math.round(sum.fat),
    entries: snapshots.length,
  };
}
