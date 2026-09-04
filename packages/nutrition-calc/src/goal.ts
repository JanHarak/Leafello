/**
 * Kalorický cíl, makroživiny, pitný cíl a kontrola cílové váhy.
 *
 * Bezpečnostní limity jsou nepřekročitelné:
 * - dolní hranice cíle 1200 kcal (ženy) a 1500 kcal (muži),
 * - maximální tempo 1,0 kg/týden,
 * - cílová váha odpovídající BMI pod 18,5 se nepřijme.
 */
import { RateOutOfRange, TargetWeightUnsafe } from './errors';
import type { Sex } from './bmr';

export const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };
export const MAX_RATE_KG_PER_WEEK = 1.0;
export const MIN_BMI = 18.5;
export const WATER_MIN_ML = 1500;
export const WATER_MAX_ML = 4000;

export type GoalWarning = 'rate_not_safe';

export interface KcalTargetInput {
  tdee: number;
  ratePerWeek: number;
  sex: Sex;
}

export interface KcalTargetResult {
  kcalTarget: number;
  warning: GoalWarning | null;
}

/**
 * Kalorický cíl z TDEE a tempa. Když vypočtený cíl padne pod bezpečnostní
 * hranici, cíl se nastaví na hranici a vrátí se `warning = 'rate_not_safe'`.
 * Tempo mimo rozsah 0 až 1 kg/týden je chyba a cíl se nevytvoří.
 */
export function kcalTarget({ tdee, ratePerWeek, sex }: KcalTargetInput): KcalTargetResult {
  if (ratePerWeek < 0 || ratePerWeek > MAX_RATE_KG_PER_WEEK) {
    throw new RateOutOfRange();
  }
  const raw = tdee - ratePerWeek * 1000;
  const min = MIN_KCAL[sex];
  if (raw < min) {
    return { kcalTarget: min, warning: 'rate_not_safe' };
  }
  return { kcalTarget: Math.round(raw), warning: null };
}

export interface MacrosInput {
  kcalTarget: number;
  weightKg: number;
}

export interface Macros {
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/**
 * Makroživiny na den.
 *
 * Procentní stropy 35 / 30 nejsou kosmetika: u vysoké hmotnosti spojené
 * s nízkým cílem by pravidlo „g na kilogram" vyčerpalo celý cíl bílkovinami
 * a tuky a na sacharidy by nezbylo nic. Strop zaručuje, že sacharidy nikdy
 * nevyjdou negativní.
 */
export function macros({ kcalTarget, weightKg }: MacrosInput): Macros {
  const proteinCap = Math.round((0.35 * kcalTarget) / 4);
  const proteinG = Math.min(Math.round(1.8 * weightKg), proteinCap);

  const fatCap = Math.round((0.3 * kcalTarget) / 9);
  const fatG = Math.min(Math.round(0.8 * weightKg), fatCap);

  const carbsG = Math.round((kcalTarget - proteinG * 4 - fatG * 9) / 4);
  return { proteinG, fatG, carbsG };
}

/** Pitný cíl: clamp(round(30 · kg / 50) · 50, 1500, 4000), po 50 ml. */
export function waterMl(weightKg: number): number {
  const raw = Math.round((30 * weightKg) / 50) * 50;
  return Math.min(Math.max(raw, WATER_MIN_ML), WATER_MAX_ML);
}

/** Nejnižší přijatelná váha (BMI 18,5) pro danou výšku, zaokrouhlená nahoru na 0,1 kg. */
export function lowestAcceptableWeightKg(heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.ceil(MIN_BMI * heightM * heightM * 10) / 10;
}

/** Odmítne cílovou váhu s BMI pod 18,5 a v chybě nabídne nejnižší přijatelnou váhu. */
export function assertTargetWeight(targetWeightKg: number, heightCm: number): void {
  const heightM = heightCm / 100;
  const bmi = targetWeightKg / (heightM * heightM);
  if (bmi < MIN_BMI) {
    throw new TargetWeightUnsafe(lowestAcceptableWeightKg(heightCm));
  }
}
