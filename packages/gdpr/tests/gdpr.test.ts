import { describe, expect, it } from 'vitest';

import {
  EXPORT_VERSION,
  TABLE_SPECS,
  buildExport,
  deletionOrder,
  exportOrder,
  type TableSpec,
} from '../src/index';

const specByTable = (t: string): TableSpec => {
  const s = TABLE_SPECS.find((x) => x.table === t);
  if (!s) throw new Error(`chybí spec pro ${t}`);
  return s;
};
const idx = (order: string[], t: string) => order.indexOf(t);

describe('rozsah tabulek uživatele', () => {
  it('pokrývá všechny osobní tabulky', () => {
    const tables = TABLE_SPECS.map((s) => s.table).sort();
    expect(tables).toEqual(
      [
        'avatar_state',
        'diary_entries',
        'food_servings',
        'foods',
        'goals',
        'meal_plan_items',
        'meal_plans',
        'photo_analyses',
        'profiles',
        'recipe_ingredients',
        'recipes',
        'reminders',
        'user_achievements',
        'water_logs',
        'weight_logs',
      ].sort(),
    );
  });

  it('nezahrnuje sdílené katalogy (achievements, off potraviny)', () => {
    expect(TABLE_SPECS.find((s) => s.table === 'achievements')).toBeUndefined();
  });

  it('každá tabulka má buď vlastnický sloupec, nebo rodiče', () => {
    for (const s of TABLE_SPECS) {
      const hasOwner = typeof s.ownerColumn === 'string';
      const hasParent = !!s.parent;
      expect(hasOwner !== hasParent).toBe(true); // právě jedno z toho
    }
  });
});

describe('pořadí mazání (děti před rodiči, service role)', () => {
  const order = deletionOrder();

  it('smaže potomky dřív než nadřazené záznamy', () => {
    expect(idx(order, 'recipe_ingredients')).toBeLessThan(idx(order, 'recipes'));
    expect(idx(order, 'recipe_ingredients')).toBeLessThan(idx(order, 'foods'));
    expect(idx(order, 'food_servings')).toBeLessThan(idx(order, 'foods'));
    expect(idx(order, 'meal_plan_items')).toBeLessThan(idx(order, 'meal_plans'));
  });

  it('smaže záznamy s cizím klíčem set-null před cílem, aby nezůstaly osiřelé odkazy', () => {
    // diary_entries odkazuje na foods, recipes a photo_analyses (on delete set null)
    expect(idx(order, 'diary_entries')).toBeLessThan(idx(order, 'foods'));
    expect(idx(order, 'diary_entries')).toBeLessThan(idx(order, 'recipes'));
    expect(idx(order, 'diary_entries')).toBeLessThan(idx(order, 'photo_analyses'));
  });

  it('profil (řádek auth uživatele) maže jako poslední', () => {
    expect(idx(order, 'profiles')).toBe(order.length - 1);
  });

  it('obsahuje všechny tabulky právě jednou', () => {
    expect(new Set(order).size).toBe(order.length);
    expect(order.length).toBe(TABLE_SPECS.length);
  });
});

describe('pořadí exportu (rodiče před dětmi)', () => {
  const order = exportOrder();
  it('načte rodiče dřív, aby byly k dispozici jejich id pro potomky', () => {
    expect(idx(order, 'recipes')).toBeLessThan(idx(order, 'recipe_ingredients'));
    expect(idx(order, 'foods')).toBeLessThan(idx(order, 'food_servings'));
    expect(idx(order, 'meal_plans')).toBeLessThan(idx(order, 'meal_plan_items'));
  });
  it('je přesně obráceným pořadím mazání', () => {
    expect(order).toEqual([...deletionOrder()].reverse());
  });
});

describe('metadata rodičů', () => {
  it('recipe_ingredients dědí přes recipes.owner_id', () => {
    const s = specByTable('recipe_ingredients');
    expect(s.parent).toEqual({ table: 'recipes', fk: 'recipe_id' });
  });
  it('food_servings dědí přes foods', () => {
    expect(specByTable('food_servings').parent).toEqual({ table: 'foods', fk: 'food_id' });
  });
  it('vlastní potraviny se poznají podle created_by', () => {
    expect(specByTable('foods').ownerColumn).toBe('created_by');
  });
  it('recepty podle owner_id, profil podle id', () => {
    expect(specByTable('recipes').ownerColumn).toBe('owner_id');
    expect(specByTable('profiles').ownerColumn).toBe('id');
  });
});

describe('buildExport', () => {
  it('sestaví přenositelný dokument s hlavičkou a daty', () => {
    const doc = buildExport(
      { userId: 'u-1', email: 'a@b.cz', generatedAt: '2026-09-08T10:00:00.000Z' },
      { profiles: [{ id: 'u-1', height_cm: 180 }], water_logs: [{ ml: 250 }, { ml: 300 }] },
    );
    expect(doc.meta.userId).toBe('u-1');
    expect(doc.meta.email).toBe('a@b.cz');
    expect(doc.meta.generatedAt).toBe('2026-09-08T10:00:00.000Z');
    expect(doc.meta.version).toBe(EXPORT_VERSION);
    expect(doc.meta.app).toBeTruthy();
    expect(doc.data.profiles).toHaveLength(1);
    expect(doc.data.water_logs).toHaveLength(2);
  });

  it('chybějící tabulky doplní prázdným polem, aby byl tvar stabilní', () => {
    const doc = buildExport({ userId: 'u-1', generatedAt: '2026-09-08T10:00:00.000Z' }, {});
    for (const s of TABLE_SPECS) {
      expect(Array.isArray(doc.data[s.table])).toBe(true);
      expect(doc.data[s.table]).toHaveLength(0);
    }
  });

  it('spočítá souhrn počtu řádků', () => {
    const doc = buildExport(
      { userId: 'u-1', generatedAt: '2026-09-08T10:00:00.000Z' },
      { water_logs: [{ ml: 1 }, { ml: 2 }], weight_logs: [{ weight_kg: 80 }] },
    );
    expect(doc.meta.rowCounts.water_logs).toBe(2);
    expect(doc.meta.rowCounts.weight_logs).toBe(1);
    expect(doc.meta.totalRows).toBe(3);
  });
});
