/**
 * Čistá logika pro GDPR (N-06 export + smazání účtu).
 *
 * Jediný zdroj pravdy o tom, které tabulky patří uživateli, jak se v nich
 * najdou jeho řádky a v jakém pořadí se bezpečně mažou. Export běží čistě
 * klientsky pod RLS (uživatel čte jen svá data); smazání účtu běží v Edge
 * Function se service_role klíčem, protože jen ten smí smazat řádek v
 * `auth.users`. Sdílené katalogy (číselník `achievements`, potraviny `off`)
 * osobní data nejsou, a proto se ani neexportují, ani nemažou.
 *
 * Tady je jen popis a skládání. Skutečné SQL/HTTP dělá klient a funkce.
 */

export const EXPORT_VERSION = 1;
export const APP_NAME = 'dietapp';

/** Vlastnický sloupec = tabulka se filtruje přímo přes id uživatele. */
export type OwnerColumn = 'user_id' | 'owner_id' | 'created_by' | 'id';

/** Odkaz na rodiče = tabulka nemá vlastní klíč uživatele, dědí ho přes FK. */
export interface ParentRef {
  /** Tabulka rodiče (má vlastní vlastnický sloupec). */
  table: string;
  /** Cizí klíč v této tabulce, který míří na rodičovské id. */
  fk: string;
}

export interface TableSpec {
  table: string;
  ownerColumn?: OwnerColumn;
  parent?: ParentRef;
}

/**
 * Tabulky s osobními daty v pořadí mazání: potomci před rodiči a záznamy s
 * cizím klíčem `on delete set null` (např. diary_entries → foods/recipes/
 * photo_analyses) před svými cíli, aby po mazání nezůstaly osiřelé odkazy.
 * `profiles` (řádek auth uživatele) je poslední. Export načítá v obráceném
 * pořadí, aby měl id rodičů dřív, než se ptá na jejich potomky.
 */
export const TABLE_SPECS: readonly TableSpec[] = [
  { table: 'recipe_ingredients', parent: { table: 'recipes', fk: 'recipe_id' } },
  { table: 'food_servings', parent: { table: 'foods', fk: 'food_id' } },
  { table: 'meal_plan_items', parent: { table: 'meal_plans', fk: 'meal_plan_id' } },
  { table: 'diary_entries', ownerColumn: 'user_id' },
  { table: 'water_logs', ownerColumn: 'user_id' },
  { table: 'weight_logs', ownerColumn: 'user_id' },
  { table: 'reminders', ownerColumn: 'user_id' },
  { table: 'user_achievements', ownerColumn: 'user_id' },
  { table: 'avatar_state', ownerColumn: 'user_id' },
  { table: 'photo_analyses', ownerColumn: 'user_id' },
  { table: 'meal_plans', ownerColumn: 'user_id' },
  { table: 'recipes', ownerColumn: 'owner_id' },
  { table: 'foods', ownerColumn: 'created_by' },
  { table: 'goals', ownerColumn: 'user_id' },
  { table: 'profiles', ownerColumn: 'id' },
] as const;

/** Názvy tabulek v pořadí bezpečného mazání (děti → rodiče). */
export function deletionOrder(): string[] {
  return TABLE_SPECS.map((s) => s.table);
}

/** Názvy tabulek v pořadí pro export (rodiče → děti). */
export function exportOrder(): string[] {
  return [...deletionOrder()].reverse();
}

export interface ExportMeta {
  userId: string;
  generatedAt: string;
  email?: string;
}

export interface ExportDocument {
  meta: {
    app: string;
    version: number;
    userId: string;
    email?: string;
    generatedAt: string;
    rowCounts: Record<string, number>;
    totalRows: number;
    notice: string;
  };
  data: Record<string, unknown[]>;
}

/**
 * Sestaví přenositelný exportní dokument. Doplní chybějící tabulky prázdným
 * polem, aby měl výstup vždy stejný tvar, a spočítá souhrn řádků.
 */
export function buildExport(meta: ExportMeta, rows: Record<string, unknown[]>): ExportDocument {
  const data: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  let totalRows = 0;

  for (const spec of TABLE_SPECS) {
    const list = Array.isArray(rows[spec.table]) ? rows[spec.table] : [];
    data[spec.table] = list;
    rowCounts[spec.table] = list.length;
    totalRows += list.length;
  }

  return {
    meta: {
      app: APP_NAME,
      version: EXPORT_VERSION,
      userId: meta.userId,
      ...(meta.email ? { email: meta.email } : {}),
      generatedAt: meta.generatedAt,
      rowCounts,
      totalRows,
      notice:
        'Export obsahuje osobní data z tvého účtu. Sdílené číselníky (odznaky, veřejné potraviny Open Food Facts) nejsou zahrnuté.',
    },
    data,
  };
}
