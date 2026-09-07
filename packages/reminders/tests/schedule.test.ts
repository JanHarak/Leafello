/**
 * Testy generátoru rozvrhu připomínek (F-13).
 *
 * Pití se rozdělí na fáze rovnoměrně přes den, součet dávek přesně sedne
 * na denní cíl. Jídlo má tři hlavní časy. Celkem se drží limit 8 notifikací.
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_DAILY_NOTIFICATIONS,
  mealSchedule,
  waterSchedule,
} from '../src';

describe('rozvrh pití', () => {
  it('5 fází pokrývá den rovnoměrně', () => {
    const phases = waterSchedule(2400, 5, 8, 20);
    expect(phases).toHaveLength(5);
    expect(phases.map((p) => p.hour)).toEqual([8, 11, 14, 17, 20]);
  });

  it('součet dávek přesně odpovídá cíli', () => {
    for (const goal of [1500, 1950, 2400, 3000, 4000]) {
      const phases = waterSchedule(goal, 5, 8, 20);
      expect(phases.reduce((s, p) => s + p.ml, 0), `cíl ${goal}`).toBe(goal);
    }
  });

  it('dávky jsou zaokrouhlené na 50 ml (kromě dorovnání poslední)', () => {
    const phases = waterSchedule(2400, 5, 8, 20);
    for (const p of phases.slice(0, -1)) {
      expect(p.ml % 50).toBe(0);
    }
    expect(phases.every((p) => p.ml > 0)).toBe(true);
  });

  it('jde nastavit jiný počet fází', () => {
    expect(waterSchedule(2000, 4, 9, 21)).toHaveLength(4);
    expect(waterSchedule(2000, 8, 8, 22)).toHaveLength(8);
  });

  it('méně než 2 fáze se zvednou na 2', () => {
    expect(waterSchedule(2000, 1, 8, 20).length).toBeGreaterThanOrEqual(2);
  });
});

describe('rozvrh jídla', () => {
  it('tři hlavní jídla v běžných časech', () => {
    const meals = mealSchedule();
    expect(meals.map((m) => m.meal)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(meals[0]).toMatchObject({ hour: 8, minute: 0 });
  });
});

describe('limit notifikací', () => {
  it('pití (5) plus jídlo (3) se vejde do denního limitu', () => {
    const total = waterSchedule(2400, 5, 8, 20).length + mealSchedule().length;
    expect(total).toBeLessThanOrEqual(MAX_DAILY_NOTIFICATIONS);
    expect(MAX_DAILY_NOTIFICATIONS).toBe(8);
  });
});
