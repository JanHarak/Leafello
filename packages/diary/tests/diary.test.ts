/**
 * Testy výpočtů deníku (zadání 7.7): snapshot záznamu (T-57), výživa receptu
 * na porci (T-60) a denní součty (T-61).
 *
 * Snapshot se počítá v okamžiku zápisu a ukládá do záznamu. Denní součty se
 * počítají ze snapshotů, nikdy joinem na aktuální potraviny – proto je
 * pozdější změna potraviny nezmění (to hlídají DB testy T-58 a T-59).
 */
import { describe, it, expect } from 'vitest';
import { dailyTotals, entrySnapshot, recipePerPortion } from '../src';

describe('snapshot záznamu', () => {
  it('T-57: 250 kcal/100 g, 37 g → 92,5 kcal', () => {
    const snap = entrySnapshot({ kcal: 250, protein: 10, carbs: 30, fat: 8 }, 37);
    expect(snap.kcal).toBe(92.5);
    expect(snap.protein).toBeCloseTo(3.7, 6);
  });

  it('snapshot je lineární v gramáži', () => {
    expect(entrySnapshot({ kcal: 100 }, 200).kcal).toBe(200);
    expect(entrySnapshot({ kcal: 100 }, 50).kcal).toBe(50);
  });
});

describe('recept na porci', () => {
  it('T-60: recept na 4 porce, 1 porce = součet ingrediencí / 4', () => {
    const perPortion = recipePerPortion(
      [
        { per100g: { kcal: 100, protein: 10 }, grams: 200 }, // 200 kcal, 20 g B
        { per100g: { kcal: 50, protein: 2 }, grams: 100 }, //   50 kcal,  2 g B
      ],
      4,
    );
    // součet 250 kcal a 22 g bílkovin, na porci /4
    expect(perPortion.kcal).toBe(62.5);
    expect(perPortion.protein).toBe(5.5);
  });

  it('odmítne nula nebo záporný počet porcí', () => {
    expect(() => recipePerPortion([{ per100g: { kcal: 100 }, grams: 100 }], 0)).toThrow();
  });
});

describe('denní součty', () => {
  it('T-61: součet ze 3 záznamů na celé kcal', () => {
    const totals = dailyTotals([
      { kcal: 92.5, protein: 3.7, carbs: 11.1, fat: 3 },
      { kcal: 100.4, protein: 5, carbs: 10, fat: 4 },
      { kcal: 50.1, protein: 2, carbs: 5, fat: 1 },
    ]);
    // 92,5 + 100,4 + 50,1 = 243 → zaokrouhleno 243
    expect(totals.kcal).toBe(243);
    expect(totals.entries).toBe(3);
  });

  it('prázdný den má nulové součty', () => {
    const totals = dailyTotals([]);
    expect(totals.kcal).toBe(0);
    expect(totals.entries).toBe(0);
  });
});
