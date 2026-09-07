/**
 * Generátor rozvrhu připomínek (F-13).
 *
 * Pití se rozdělí na fáze rovnoměrně přes bdělou část dne; součet dávek
 * přesně sedne na denní pitný cíl. Jídlo má tři hlavní časy. Celkem se drží
 * limit 8 notifikací denně a tón je věcný, nikdy nevyčítavý (text skládá
 * aplikace přes i18n).
 */

export const MAX_DAILY_NOTIFICATIONS = 8;

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface WaterPhase {
  hour: number;
  minute: number;
  ml: number;
}

export interface MealPhase {
  hour: number;
  minute: number;
  meal: MealType;
}

/**
 * Rozdělí denní pitný cíl na `count` fází mezi `startHour` a `endHour`.
 * Dávky jsou zaokrouhlené na 50 ml, poslední fáze dorovná součet na cíl.
 */
export function waterSchedule(goalMl: number, count = 5, startHour = 8, endHour = 20): WaterPhase[] {
  const phases = Math.max(2, Math.round(count));
  const span = endHour - startHour;

  let base = Math.round(goalMl / phases / 50) * 50;
  if (base <= 0) base = 50;
  // Když by dorovnání poslední fáze vyšlo nekladné, sniž základ.
  if (goalMl - base * (phases - 1) <= 0) {
    base = Math.max(50, Math.floor(goalMl / phases / 50) * 50);
  }

  const out: WaterPhase[] = [];
  for (let i = 0; i < phases; i += 1) {
    const hour = startHour + Math.round((i * span) / (phases - 1));
    const ml = i < phases - 1 ? base : goalMl - base * (phases - 1);
    out.push({ hour, minute: 0, ml });
  }
  return out;
}

/** Tři hlavní jídla v běžných časech. */
export function mealSchedule(): MealPhase[] {
  return [
    { hour: 8, minute: 0, meal: 'breakfast' },
    { hour: 12, minute: 30, meal: 'lunch' },
    { hour: 18, minute: 30, meal: 'dinner' },
  ];
}
