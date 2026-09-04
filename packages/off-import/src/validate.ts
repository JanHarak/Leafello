/**
 * Validace a normalizace jednoho záznamu potraviny z Open Food Facts (F-03).
 *
 * Pravidla jsou vynucená záměrně přísně: špatná data o potravinách vedou
 * k chybným výpočtům příjmu, které si uživatel nemá jak ověřit. Když
 * záznam poruší kterékoliv pravidlo, zahodí se.
 */

export const KCAL_MIN = 0;
export const KCAL_MAX = 900;
export const MACRO_MIN = 0;
export const MACRO_MAX = 100;
export const MACRO_SUM_MAX = 105;
export const ATWATER_TOLERANCE = 0.25;
export const NAME_MAX_LENGTH = 200;

export interface RawFood {
  name?: string | null;
  barcode?: string | null;
  brand?: string | null;
  external_id?: string | null;
  kcal_100g?: number | null;
  protein_100g?: number | null;
  carbs_100g?: number | null;
  fat_100g?: number | null;
  fiber_100g?: number | null;
  sugar_100g?: number | null;
  salt_100g?: number | null;
}

export interface NormalizedFood {
  name: string;
  barcode: string | null;
  brand: string | null;
  externalId: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number | null;
  sugar_100g: number | null;
  salt_100g: number | null;
}

export type DiscardReason =
  | 'missing_name'
  | 'missing_kcal'
  | 'kcal_out_of_range'
  | 'macro_out_of_range'
  | 'macro_sum_too_high'
  | 'kcal_without_macros'
  | 'atwater_mismatch';

export type NormalizeResult =
  | { status: 'accepted'; food: NormalizedFood }
  | { status: 'discarded'; reason: DiscardReason };

function discard(reason: DiscardReason): NormalizeResult {
  return { status: 'discarded', reason };
}

export function normalizeFood(raw: RawFood): NormalizeResult {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name === '') return discard('missing_name');

  if (raw.kcal_100g === null || raw.kcal_100g === undefined) return discard('missing_kcal');
  const kcal = raw.kcal_100g;
  if (kcal < KCAL_MIN || kcal > KCAL_MAX) return discard('kcal_out_of_range');

  const protein = raw.protein_100g ?? 0;
  const carbs = raw.carbs_100g ?? 0;
  const fat = raw.fat_100g ?? 0;
  for (const macro of [protein, carbs, fat]) {
    if (macro < MACRO_MIN || macro > MACRO_MAX) return discard('macro_out_of_range');
  }
  if (protein + carbs + fat > MACRO_SUM_MAX) return discard('macro_sum_too_high');

  if (kcal > 0 && protein === 0 && carbs === 0 && fat === 0) {
    return discard('kcal_without_macros');
  }

  if (kcal > 0) {
    const atwater = 4 * protein + 4 * carbs + 9 * fat;
    if (Math.abs(kcal - atwater) / kcal > ATWATER_TOLERANCE) return discard('atwater_mismatch');
  }

  return {
    status: 'accepted',
    food: {
      name: name.slice(0, NAME_MAX_LENGTH),
      barcode: raw.barcode ?? null,
      brand: raw.brand ?? null,
      externalId: raw.external_id ?? null,
      kcal_100g: kcal,
      protein_100g: protein,
      carbs_100g: carbs,
      fat_100g: fat,
      fiber_100g: raw.fiber_100g ?? null,
      sugar_100g: raw.sugar_100g ?? null,
      salt_100g: raw.salt_100g ?? null,
    },
  };
}
