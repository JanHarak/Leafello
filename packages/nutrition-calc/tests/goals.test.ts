/**
 * Testy výpočtu cílů ze zadání, sekce 7.1 (T-01 až T-15, T-70 až T-75).
 *
 * Zaokrouhlování je závazné: BMR se do dalších výpočtů předává
 * NEZAOKROUHLENÝ, zaokrouhluje se jen pro zobrazení. TDEE se zaokrouhlí na
 * celé kcal a z něj se počítá cíl. Makra na celé gramy.
 */
import { describe, it, expect } from 'vitest';
import {
  ACTIVITY_COEFFICIENTS,
  MIN_KCAL,
  ageFromBirthDate,
  assertTargetWeight,
  bmr,
  kcalTarget,
  lowestAcceptableWeightKg,
  macros,
  tdee,
  waterMl,
  HeightOutOfRange,
  InvalidBirthDate,
  RateOutOfRange,
  TargetWeightUnsafe,
} from '../src';

/* -------------------------------------------------------------------------- */
/* BMR (Mifflin-St Jeor)                                                      */
/* -------------------------------------------------------------------------- */

describe('BMR', () => {
  it('T-01: muž, 80 kg, 180 cm, 30 let → 1780', () => {
    expect(Math.round(bmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 }))).toBe(1780);
  });

  it('T-02: žena, 65 kg, 165 cm, 40 let → 1320', () => {
    expect(Math.round(bmr({ sex: 'female', weightKg: 65, heightCm: 165, age: 40 }))).toBe(1320);
  });

  it('T-73: výška 90 cm → HeightOutOfRange', () => {
    expect(() => bmr({ sex: 'female', weightKg: 60, heightCm: 90, age: 30 })).toThrow(HeightOutOfRange);
  });
});

/* -------------------------------------------------------------------------- */
/* TDEE                                                                       */
/* -------------------------------------------------------------------------- */

describe('TDEE', () => {
  it('T-03: muž z T-01 + moderate (1,55) → 2759', () => {
    const b = bmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 });
    expect(tdee(b, 'moderate')).toBe(2759);
  });

  it('T-05: žena z T-02 + sedentary (1,2) → 1584', () => {
    const b = bmr({ sex: 'female', weightKg: 65, heightCm: 165, age: 40 });
    expect(tdee(b, 'sedentary')).toBe(1584);
  });

  it('T-08: TDEE počítá z nezaokrouhleného BMR', () => {
    // BMR = 1886,25; round(1886,25 · 1,725) = 3254. Ze zaokrouhleného
    // BMR 1886 by vyšlo 3253, proto se musí předávat nezaokrouhlený.
    const b = bmr({ sex: 'male', weightKg: 95, heightCm: 185, age: 45 });
    expect(Math.round(b)).toBe(1886);
    expect(tdee(b, 'high')).toBe(3254);
  });

  it('koeficienty aktivity odpovídají zadání', () => {
    expect(ACTIVITY_COEFFICIENTS).toEqual({
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      high: 1.725,
      very_high: 1.9,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Kalorický cíl a bezpečnostní limity                                        */
/* -------------------------------------------------------------------------- */

describe('kalorický cíl', () => {
  function tdeeFor(sex: 'male' | 'female', kg: number, cm: number, age: number, act: keyof typeof ACTIVITY_COEFFICIENTS) {
    return tdee(bmr({ sex, weightKg: kg, heightCm: cm, age }), act);
  }

  it('T-04: muž 80 kg, TDEE 2759, tempo 0,5 → 2259, bez varování', () => {
    const t = tdeeFor('male', 80, 180, 30, 'moderate');
    const r = kcalTarget({ tdee: t, ratePerWeek: 0.5, sex: 'male' });
    expect(r.kcalTarget).toBe(2259);
    expect(r.warning).toBeNull();
  });

  it('T-06: žena, TDEE 1584, tempo 0,5 → 1200 (hranice), rate_not_safe', () => {
    const t = tdeeFor('female', 65, 165, 40, 'sedentary');
    const r = kcalTarget({ tdee: t, ratePerWeek: 0.5, sex: 'female' });
    expect(r.kcalTarget).toBe(1200);
    expect(r.warning).toBe('rate_not_safe');
  });

  it('T-07: žena 55/160/25, sedentary, 0,75 → TDEE 1517, cíl 1200, rate_not_safe', () => {
    const t = tdeeFor('female', 55, 160, 25, 'sedentary');
    expect(t).toBe(1517);
    const r = kcalTarget({ tdee: t, ratePerWeek: 0.75, sex: 'female' });
    expect(r.kcalTarget).toBe(1200);
    expect(r.warning).toBe('rate_not_safe');
  });

  it('T-08: muž, TDEE 3254, tempo 1,0 → 2254, bez varování', () => {
    const t = tdeeFor('male', 95, 185, 45, 'high');
    expect(t).toBe(3254);
    const r = kcalTarget({ tdee: t, ratePerWeek: 1.0, sex: 'male' });
    expect(r.kcalTarget).toBe(2254);
    expect(r.warning).toBeNull();
  });

  it('T-09: tempo 1,5 kg/týden → RateOutOfRange', () => {
    expect(() => kcalTarget({ tdee: 2600, ratePerWeek: 1.5, sex: 'male' })).toThrow(RateOutOfRange);
  });

  it('T-71: muž 60/165/60, sedentary, 1,0 → TDEE 1604, cíl 1500, rate_not_safe', () => {
    const t = tdeeFor('male', 60, 165, 60, 'sedentary');
    expect(t).toBe(1604);
    const r = kcalTarget({ tdee: t, ratePerWeek: 1.0, sex: 'male' });
    expect(r.kcalTarget).toBe(1500);
    expect(r.warning).toBe('rate_not_safe');
  });

  it('T-72: žena, tempo 0 (udržování) → 1584, bez varování', () => {
    const t = tdeeFor('female', 65, 165, 40, 'sedentary');
    const r = kcalTarget({ tdee: t, ratePerWeek: 0, sex: 'female' });
    expect(r.kcalTarget).toBe(1584);
    expect(r.warning).toBeNull();
  });

  it('mužská a ženská hranice jsou 1500 a 1200', () => {
    expect(MIN_KCAL).toEqual({ male: 1500, female: 1200 });
  });
});

/* -------------------------------------------------------------------------- */
/* Cílová váha                                                                */
/* -------------------------------------------------------------------------- */

describe('cílová váha', () => {
  it('T-10: cíl 48 kg při 170 cm (BMI 16,6) → TargetWeightUnsafe, min 53,5 kg', () => {
    expect(() => assertTargetWeight(48, 170)).toThrow(TargetWeightUnsafe);
    try {
      assertTargetWeight(48, 170);
    } catch (err) {
      expect(err).toBeInstanceOf(TargetWeightUnsafe);
      expect((err as TargetWeightUnsafe).lowestAcceptableWeightKg).toBe(53.5);
    }
    expect(lowestAcceptableWeightKg(170)).toBe(53.5);
  });

  it('cílová váha s BMI ≥ 18,5 projde', () => {
    expect(() => assertTargetWeight(60, 170)).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Makroživiny                                                                */
/* -------------------------------------------------------------------------- */

describe('makra', () => {
  it('T-11: 80 kg, 2259 kcal → B 144, T 64, S 277 (±2)', () => {
    const m = macros({ kcalTarget: 2259, weightKg: 80 });
    expect(m.proteinG).toBe(144);
    expect(m.fatG).toBe(64);
    expect(m.carbsG).toBeGreaterThanOrEqual(275);
    expect(m.carbsG).toBeLessThanOrEqual(279);
  });

  it('T-70: 120 kg, 1200 kcal → B 105, T 40, S 105, součet 1200 kcal', () => {
    const m = macros({ kcalTarget: 1200, weightKg: 120 });
    expect(m.proteinG).toBe(105);
    expect(m.fatG).toBe(40);
    expect(m.carbsG).toBe(105);
    expect(m.proteinG * 4 + m.fatG * 9 + m.carbsG * 4).toBe(1200);
  });

  it('T-75: sacharidy nikdy < 0 a součet makro kalorií = cíl ±5', () => {
    const cases = [
      { kcalTarget: 1200, weightKg: 120 },
      { kcalTarget: 1500, weightKg: 60 },
      { kcalTarget: 2259, weightKg: 80 },
      { kcalTarget: 3254, weightKg: 95 },
      { kcalTarget: 1800, weightKg: 150 },
      { kcalTarget: 2000, weightKg: 55 },
    ];
    for (const c of cases) {
      const m = macros(c);
      expect(m.carbsG, JSON.stringify(c)).toBeGreaterThanOrEqual(0);
      const sum = m.proteinG * 4 + m.fatG * 9 + m.carbsG * 4;
      expect(Math.abs(sum - c.kcalTarget), JSON.stringify(c)).toBeLessThanOrEqual(5);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Pitný cíl                                                                  */
/* -------------------------------------------------------------------------- */

describe('pitný cíl', () => {
  it('T-12: 80 kg → 2400 ml', () => expect(waterMl(80)).toBe(2400));
  it('T-13: 45 kg (výpočet 1350) → 1500 ml (dolní hranice)', () => expect(waterMl(45)).toBe(1500));
  it('T-14: 150 kg (výpočet 4500) → 4000 ml (horní hranice)', () => expect(waterMl(150)).toBe(4000));
});

/* -------------------------------------------------------------------------- */
/* Věk z data narození                                                        */
/* -------------------------------------------------------------------------- */

describe('věk', () => {
  it('T-15: den před narozeninami je věk o 1 nižší', () => {
    // Narozen 15. 6. 2000. Dne 14. 6. 2026 je mu ještě 25, ne 26.
    expect(ageFromBirthDate('2000-06-15', '2026-06-14')).toBe(25);
    expect(ageFromBirthDate('2000-06-15', '2026-06-15')).toBe(26);
  });

  it('T-74: datum narození v budoucnosti → InvalidBirthDate', () => {
    expect(() => ageFromBirthDate('2100-01-01', '2026-09-04')).toThrow(InvalidBirthDate);
  });
});
