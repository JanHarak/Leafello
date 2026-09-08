/**
 * Vendorovaná kopie logiky z balíčku @dietapp/gdpr pro Deno runtime.
 * Edge Function nemůže importovat z ../../packages (mimo strom nasazení),
 * proto je tady zrcadlově pořadí mazání. Zdroj pravdy je packages/gdpr;
 * při změně schématu uprav obě místa (kryje test v packages/gdpr).
 */

export type OwnerColumn = 'user_id' | 'owner_id' | 'created_by' | 'id';

export interface ParentRef {
  table: string;
  fk: string;
}

export interface TableSpec {
  table: string;
  ownerColumn?: OwnerColumn;
  parent?: ParentRef;
}

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
