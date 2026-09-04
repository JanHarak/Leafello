/**
 * Testy validace a normalizace importu z Open Food Facts (zadání 7.4,
 * fixtures T-33 až T-40), plus hraniční případy z pravidel F-03.
 */
import { describe, it, expect } from 'vitest';
import {
  NAME_MAX_LENGTH,
  dedupeByBarcode,
  importFoods,
  normalizeFood,
  type RawFood,
} from '../src';

function raw(overrides: Partial<RawFood> = {}): RawFood {
  return {
    name: 'Testovací potravina',
    kcal_100g: 400,
    protein_100g: 5,
    carbs_100g: 60,
    fat_100g: 15,
    ...overrides,
  };
}

function accepted(r: RawFood) {
  const res = normalizeFood(r);
  return res.status === 'accepted' ? res.food : null;
}

describe('validace jednoho záznamu', () => {
  it('T-33: kcal 400, P5 C60 F15 → přijat (Atwater 1,3 %)', () => {
    const res = normalizeFood(raw());
    expect(res.status).toBe('accepted');
  });

  it('T-34: kcal 250, P0 C0 F0 → zahozen', () => {
    const res = normalizeFood(raw({ kcal_100g: 250, protein_100g: 0, carbs_100g: 0, fat_100g: 0 }));
    expect(res.status).toBe('discarded');
  });

  it('T-35: tuk 120 → zahozen', () => {
    const res = normalizeFood(raw({ fat_100g: 120 }));
    expect(res.status).toBe('discarded');
  });

  it('T-36: kcal 1200 → zahozen', () => {
    const res = normalizeFood(raw({ kcal_100g: 1200 }));
    expect(res.status).toBe('discarded');
  });

  it('T-37: bez názvu → zahozen', () => {
    expect(normalizeFood(raw({ name: undefined })).status).toBe('discarded');
    expect(normalizeFood(raw({ name: '' })).status).toBe('discarded');
    expect(normalizeFood(raw({ name: '   ' })).status).toBe('discarded');
  });

  it('T-38: kcal 100, P20 C20 F20 (Atwater 340, 240 %) → zahozen', () => {
    const res = normalizeFood(raw({ kcal_100g: 100, protein_100g: 20, carbs_100g: 20, fat_100g: 20 }));
    expect(res.status).toBe('discarded');
  });

  it('T-40: název 350 znaků → přijat, zkrácen na 200', () => {
    const longName = 'a'.repeat(350);
    const food = accepted(raw({ name: longName }));
    expect(food).not.toBeNull();
    expect(food?.name.length).toBe(NAME_MAX_LENGTH);
    expect(NAME_MAX_LENGTH).toBe(200);
  });

  it('chybějící kcal → zahozen', () => {
    expect(normalizeFood(raw({ kcal_100g: undefined })).status).toBe('discarded');
    expect(normalizeFood(raw({ kcal_100g: null })).status).toBe('discarded');
  });

  it('záporné makro → zahozen', () => {
    expect(normalizeFood(raw({ protein_100g: -1 })).status).toBe('discarded');
  });

  it('součet maker přes 105 g → zahozen', () => {
    const res = normalizeFood(raw({ protein_100g: 40, carbs_100g: 40, fat_100g: 40 }));
    expect(res.status).toBe('discarded');
  });

  it('chybějící makra se berou jako 0 a projdou při souhlasném kcal', () => {
    // kcal 0, makra chybí → není porušení „kcal>0 a makra 0", projde.
    const res = normalizeFood({ name: 'Voda', kcal_100g: 0 });
    expect(res.status).toBe('accepted');
  });
});

describe('deduplikace podle barcode', () => {
  it('T-39: ze dvou se stejným barcode zůstane ten s víc vyplněnými poli', () => {
    const rich: RawFood = {
      name: 'Bohatý',
      barcode: '111',
      brand: 'Značka',
      external_id: 'x1',
      kcal_100g: 400,
      protein_100g: 5,
      carbs_100g: 60,
      fat_100g: 15,
    };
    const sparse: RawFood = {
      name: 'Chudý',
      barcode: '111',
      kcal_100g: 400,
      fat_100g: 15,
    };
    const out = dedupeByBarcode([sparse, rich]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Bohatý');
  });

  it('záznamy bez barcode se nezlučují', () => {
    const a = accepted(raw({ name: 'A', barcode: null }))!;
    const b = accepted(raw({ name: 'B', barcode: null }))!;
    expect(dedupeByBarcode([a, b])).toHaveLength(2);
  });
});

describe('celá pipeline importu', () => {
  it('zahodí neplatné a zdedupuje platné', () => {
    const out = importFoods([
      raw({ name: 'Dobrá', barcode: '900' }),
      raw({ name: 'Špatná', kcal_100g: 1200 }), // zahozeno
      raw({ name: undefined as unknown as string }), // zahozeno (bez názvu)
    ]);
    expect(out.every((f) => f.name.length <= NAME_MAX_LENGTH)).toBe(true);
    expect(out.some((f) => f.name === 'Dobrá')).toBe(true);
    expect(out.some((f) => f.name === 'Špatná')).toBe(false);
  });
});
