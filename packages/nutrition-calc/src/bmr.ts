/**
 * BMR (Mifflin-St Jeor), TDEE a věk.
 *
 * Zaokrouhlování je závazné: BMR se vrací NEZAOKROUHLENÝ a takový se předává
 * do TDEE. Zaokrouhluje se až TDEE (na celé kcal) a BMR jen pro zobrazení.
 * Test T-08 to hlídá: ze zaokrouhleného BMR by TDEE vyšlo o 1 kcal jinak.
 */
import { HeightOutOfRange, InvalidBirthDate } from './errors';

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high';

export const ACTIVITY_COEFFICIENTS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
};

export const HEIGHT_MIN_CM = 100;
export const HEIGHT_MAX_CM = 250;

export interface BmrInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}

/** BMR podle Mifflin-St Jeor, nezaokrouhlený. */
export function bmr({ sex, weightKg, heightCm, age }: BmrInput): number {
  if (heightCm < HEIGHT_MIN_CM || heightCm > HEIGHT_MAX_CM) {
    throw new HeightOutOfRange();
  }
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

/** TDEE = round(BMR_nezaokrouhlené · koeficient aktivity). */
export function tdee(bmrValue: number, activity: ActivityLevel): number {
  return Math.round(bmrValue * ACTIVITY_COEFFICIENTS[activity]);
}

/**
 * Věk z data narození. Věk se zvyšuje až v den narozenin, takže den předtím
 * je věk o 1 nižší než rozdíl kalendářních let (T-15). Datum v budoucnosti je
 * chyba (T-74).
 */
export function ageFromBirthDate(birthDate: string | Date, today: string | Date = new Date()): number {
  const born = new Date(birthDate);
  const now = new Date(today);
  if (Number.isNaN(born.getTime())) throw new InvalidBirthDate();
  if (born.getTime() > now.getTime()) throw new InvalidBirthDate();

  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
