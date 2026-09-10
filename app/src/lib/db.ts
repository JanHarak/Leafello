/**
 * Datová vrstva nad Supabase: profil, cíl a deník. Všechno je chráněné RLS
 * (uživatel vidí a zapisuje jen svá data), klient posílá JWT automaticky.
 */
import {
  TABLE_SPECS,
  buildExport,
  exportOrder,
  type ExportDocument,
} from '@dietapp/gdpr';

import { supabase } from './supabase';

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface ProfileInput {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  activity: ActivityLevel;
}

export interface GoalInput {
  targetWeightKg: number;
  ratePerWeek: number;
  kcalTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
}

export interface GoalRow {
  kcal_target: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
  target_weight_kg: number;
  rate_kg_per_week: number;
}

/** Uloží profil a nový aktivní cíl. Předchozí aktivní cíl se deaktivuje. */
export async function saveProfileAndGoal(userId: string, profile: ProfileInput, goal: GoalInput): Promise<void> {
  const profileRes = await supabase.from('profiles').upsert({
    id: userId,
    sex: profile.sex,
    birth_date: profile.birthDate,
    height_cm: profile.heightCm,
    activity: profile.activity,
    updated_at: new Date().toISOString(),
  });
  if (profileRes.error) throw profileRes.error;

  await supabase.from('goals').update({ is_active: false }).eq('user_id', userId).eq('is_active', true);

  const goalRes = await supabase.from('goals').insert({
    user_id: userId,
    target_weight_kg: goal.targetWeightKg,
    rate_kg_per_week: goal.ratePerWeek,
    kcal_target: goal.kcalTarget,
    protein_g: goal.proteinG,
    carbs_g: goal.carbsG,
    fat_g: goal.fatG,
    water_ml: goal.waterMl,
    is_active: true,
  });
  if (goalRes.error) throw goalRes.error;
}

/** Vrátí aktivní cíl přihlášeného uživatele, nebo null. */
export async function getActiveGoal(): Promise<GoalRow | null> {
  const { data, error } = await supabase
    .from('goals')
    .select('kcal_target, protein_g, carbs_g, fat_g, water_ml, target_weight_kg, rate_kg_per_week')
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface DiarySnapshot {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DiaryEntryRow {
  id: string;
  meal: MealType;
  grams: number;
  snapshot: DiarySnapshot;
}

/** Záznamy deníku pro dnešek. */
export async function listTodayEntries(): Promise<DiaryEntryRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('diary_entries')
    .select('id, meal, grams, snapshot')
    .eq('entry_date', today)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DiaryEntryRow[];
}

/**
 * Přidá záznam do deníku. Ukázkové potraviny nejsou v tabulce foods, proto
 * food_id zůstává null a výživa i název jsou ve `snapshot` (zdroj pravdy).
 */
export async function addDiaryEntry(
  userId: string,
  meal: MealType,
  grams: number,
  snapshot: DiarySnapshot,
  foodId?: string,
  recipeId?: string,
): Promise<void> {
  const { error } = await supabase.from('diary_entries').insert({
    user_id: userId,
    meal,
    grams,
    snapshot,
    ...(foodId ? { food_id: foodId } : {}),
    ...(recipeId ? { recipe_id: recipeId } : {}),
  });
  if (error) throw error;
}

/**
 * Upraví existující záznam deníku (gramáž, přepočítaný snapshot a přiřazení
 * k jídlu). RLS pustí jen vlastní záznam. Snapshot je zdroj pravdy o výživě.
 */
export async function updateDiaryEntry(
  id: string,
  grams: number,
  snapshot: DiarySnapshot,
  meal: MealType,
): Promise<void> {
  const { error } = await supabase
    .from('diary_entries')
    .update({ grams, snapshot, meal })
    .eq('id', id);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* E-mailové připomínky (F-13, web)                                            */
/* -------------------------------------------------------------------------- */

export type ReminderChannel = 'email' | 'push' | 'both';

export interface ReminderTimes {
  waterStart: number;
  waterEnd: number;
  breakfast: string;
  lunch: string;
  dinner: string;
  weigh: string;
}

export const DEFAULT_REMINDER_TIMES: ReminderTimes = {
  waterStart: 8,
  waterEnd: 20,
  breakfast: '08:00',
  lunch: '12:30',
  dinner: '18:30',
  weigh: '08:00',
};

export interface ReminderPrefs {
  enabled: boolean;
  channel: ReminderChannel;
  times: ReminderTimes;
}

/** Nastavení připomínek přihlášeného uživatele. */
export async function getReminderPrefs(): Promise<ReminderPrefs> {
  const { data, error } = await supabase.from('reminder_prefs').select('email_reminders, channel, times').maybeSingle();
  if (error) throw error;
  const times = (data?.times ?? {}) as Partial<ReminderTimes>;
  return {
    enabled: !!data?.email_reminders,
    channel: (data?.channel as ReminderChannel) ?? 'email',
    times: { ...DEFAULT_REMINDER_TIMES, ...times },
  };
}

/** Uloží vlastní časy připomínek (ostatní pole prefs nechá beze změny). */
export async function setReminderTimes(userId: string, times: ReminderTimes): Promise<void> {
  const { error } = await supabase
    .from('reminder_prefs')
    .upsert({ user_id: userId, times, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** Zapne/vypne připomínky, uloží e-mail a zvolený kanál (email/push/both). */
export async function setReminderPrefs(
  userId: string,
  email: string | null,
  enabled: boolean,
  channel: ReminderChannel,
): Promise<void> {
  const { error } = await supabase
    .from('reminder_prefs')
    .upsert(
      { user_id: userId, email, email_reminders: enabled, channel, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

/** Smaže záznam deníku (RLS pustí jen vlastní). */
export async function deleteDiaryEntry(id: string): Promise<void> {
  const { error } = await supabase.from('diary_entries').delete().eq('id', id);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Vyhledávání potravin (F-04)                                                 */
/* -------------------------------------------------------------------------- */

export interface FoodRow {
  id: string;
  name: string;
  brand: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number | null;
}

/** Namapuje řádek foods z PostgREST (číselné sloupce chodí jako string). */
function mapFoodRow(r: Record<string, unknown>): FoodRow {
  return {
    id: String(r.id),
    name: String(r.name),
    brand: r.brand != null ? String(r.brand) : null,
    kcal_100g: Number(r.kcal_100g),
    protein_100g: Number(r.protein_100g),
    carbs_100g: Number(r.carbs_100g),
    fat_100g: Number(r.fat_100g),
    fiber_100g: r.fiber_100g != null ? Number(r.fiber_100g) : null,
  };
}

export interface UserFoodInput {
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

/**
 * Vytvoří vlastní potravinu uživatele (F-03, source='user'). RLS ji zpřístupní
 * jen jemu (foods_read: source='off' nebo created_by=auth.uid()). Trigger
 * naplní search_tsv, takže je hned dohledatelná přes search_foods.
 */
export async function createUserFood(userId: string, input: UserFoodInput): Promise<FoodRow> {
  const { data, error } = await supabase
    .from('foods')
    .insert({
      source: 'user',
      created_by: userId,
      name: input.name.trim().slice(0, 200),
      kcal_100g: input.kcal_100g,
      protein_100g: input.protein_100g,
      carbs_100g: input.carbs_100g,
      fat_100g: input.fat_100g,
    })
    .select('id, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g')
    .single();
  if (error) throw error;
  return mapFoodRow(data as Record<string, unknown>);
}

/**
 * Vyhledá potraviny v tabulce foods přes RPC search_foods (full-text +
 * fuzzy fallback, řazení podle F-04). RLS vrátí jen potraviny se source='off'
 * nebo vlastní. Číselné sloupce chodí z PostgREST jako string, převádíme je.
 */
export async function searchFoods(q: string, limit = 20): Promise<FoodRow[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const { data, error } = await supabase.rpc('search_foods', { q: query, lim: limit });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => mapFoodRow(r));
}

/* -------------------------------------------------------------------------- */
/* Skenování čárového kódu (F-04): dohledání potraviny podle EAN/UPC          */
/* -------------------------------------------------------------------------- */

/** Potravina dohledaná podle čárového kódu (z naší DB nebo z Open Food Facts). */
export interface BarcodeProduct {
  name: string;
  brand: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  /** id řádku ve foods, pokud pochází z naší databáze (jinak undefined). */
  foodId?: string;
}

/** Najde potravinu ve foods podle čárového kódu. RLS pustí OFF i vlastní. */
export async function getFoodByBarcode(barcode: string): Promise<BarcodeProduct | null> {
  const code = barcode.trim();
  if (!code) return null;
  const { data, error } = await supabase
    .from('foods')
    .select('id, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g')
    .eq('barcode', code)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const f = mapFoodRow(data as Record<string, unknown>);
  return {
    name: f.name,
    brand: f.brand,
    kcal_100g: f.kcal_100g,
    protein_100g: f.protein_100g,
    carbs_100g: f.carbs_100g,
    fat_100g: f.fat_100g,
    foodId: f.id,
  };
}

interface OffResponse {
  status?: number;
  product?: { product_name?: string; brands?: string; nutriments?: Record<string, unknown> };
}

function offNum(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : 0;
}

/**
 * Živě dohledá produkt v Open Food Facts podle čárového kódu (veřejné API,
 * podporuje CORS). Vrátí null, když produkt neexistuje nebo nemá kcal na 100 g.
 */
export async function lookupBarcodeOFF(barcode: string): Promise<BarcodeProduct | null> {
  const code = barcode.trim();
  if (!code) return null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,nutriments`;
  let json: OffResponse;
  try {
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    json = (await resp.json()) as OffResponse;
  } catch {
    return null;
  }
  if (json.status !== 1 || !json.product) return null;
  const p = json.product;
  const n = p.nutriments ?? {};
  const kcal = offNum(n['energy-kcal_100g']);
  const name = String(p.product_name ?? '').trim();
  if (kcal <= 0 || !name) return null;
  return {
    name,
    brand: p.brands ? String(p.brands) : null,
    kcal_100g: kcal,
    protein_100g: offNum(n['proteins_100g']),
    carbs_100g: offNum(n['carbohydrates_100g']),
    fat_100g: offNum(n['fat_100g']),
  };
}

/* -------------------------------------------------------------------------- */
/* Recepty (F-11): uložení a znovupoužití                                      */
/* -------------------------------------------------------------------------- */

export interface SavedRecipeIngredient {
  foodId: string;
  name: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

export interface SavedRecipe {
  id: string;
  name: string;
  servings: number;
  meal: MealType | null;
  instructions: string | null;
  ingredients: SavedRecipeIngredient[];
}

/**
 * Uloží recept přihlášeného uživatele: řádek v recipes (owner_id=self) a jeho
 * ingredience do recipe_ingredients. Každá ingredience musí odkazovat na
 * existující potravinu (food_id, cizí klíč), takže jde uložit jen recepty
 * složené z potravin z databáze (OFF nebo vlastní). Vrací id receptu.
 */
export async function saveRecipe(
  userId: string,
  name: string,
  servings: number,
  ingredients: { foodId: string; grams: number }[],
  instructions?: string,
  meal?: MealType | null,
): Promise<string> {
  if (ingredients.length === 0) throw new Error('Recept nemá žádné ingredience.');
  const { data: recipe, error: recipeErr } = await supabase
    .from('recipes')
    .insert({
      owner_id: userId,
      name: name.trim().slice(0, 200),
      servings,
      source: 'user',
      ...(instructions && instructions.trim() ? { instructions: instructions.trim() } : {}),
      ...(meal ? { meal } : {}),
    })
    .select('id')
    .single();
  if (recipeErr) throw recipeErr;
  const recipeId = (recipe as { id: string }).id;

  const rows = ingredients.map((i) => ({ recipe_id: recipeId, food_id: i.foodId, grams: i.grams }));
  const { error: ingErr } = await supabase.from('recipe_ingredients').insert(rows);
  if (ingErr) throw ingErr;
  return recipeId;
}

/** Načte recepty uživatele včetně ingrediencí a výživy potravin (pro přepočet na porci). */
export async function listRecipes(): Promise<SavedRecipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select(
      'id, name, servings, meal, instructions, recipe_ingredients(grams, food_id, foods(name, kcal_100g, protein_100g, carbs_100g, fat_100g))',
    )
    .order('id', { ascending: false });
  if (error) throw error;
  const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  return (data ?? []).map((r: Record<string, unknown>) => {
    const ings = Array.isArray(r.recipe_ingredients) ? r.recipe_ingredients : [];
    return {
      id: String(r.id),
      name: String(r.name),
      servings: Number(r.servings),
      meal: MEALS.includes(r.meal as MealType) ? (r.meal as MealType) : null,
      instructions: typeof r.instructions === 'string' ? r.instructions : null,
      ingredients: ings
        .map((ing: Record<string, unknown>) => {
          const food = (Array.isArray(ing.foods) ? ing.foods[0] : ing.foods) as Record<string, unknown> | null;
          if (!food || ing.food_id == null) return null;
          return {
            foodId: String(ing.food_id),
            name: String(food.name),
            grams: Number(ing.grams),
            kcal_100g: Number(food.kcal_100g),
            protein_100g: Number(food.protein_100g),
            carbs_100g: Number(food.carbs_100g),
            fat_100g: Number(food.fat_100g),
          } as SavedRecipeIngredient;
        })
        .filter((x): x is SavedRecipeIngredient => x !== null),
    };
  });
}

/**
 * Přepíše existující recept: aktualizuje název a počet porcí a nahradí
 * ingredience (smaže staré, vloží nové). RLS pustí jen vlastníka receptu.
 */
export async function updateRecipe(
  recipeId: string,
  name: string,
  servings: number,
  ingredients: { foodId: string; grams: number }[],
  meal?: MealType | null,
  instructions?: string,
): Promise<void> {
  if (ingredients.length === 0) throw new Error('Recept nemá žádné ingredience.');
  const { error: upErr } = await supabase
    .from('recipes')
    .update({
      name: name.trim().slice(0, 200),
      servings,
      ...(meal !== undefined ? { meal } : {}),
      ...(instructions !== undefined ? { instructions: instructions.trim() || null } : {}),
    })
    .eq('id', recipeId);
  if (upErr) throw upErr;

  const { error: delErr } = await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
  if (delErr) throw delErr;

  const rows = ingredients.map((i) => ({ recipe_id: recipeId, food_id: i.foodId, grams: i.grams }));
  const { error: insErr } = await supabase.from('recipe_ingredients').insert(rows);
  if (insErr) throw insErr;
}

/** Smaže recept uživatele (ingredience zmizí kaskádou). */
export async function deleteRecipe(recipeId: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Pitný režim (F-08)                                                          */
/* -------------------------------------------------------------------------- */

export async function addWater(userId: string, ml: number): Promise<void> {
  const { error } = await supabase.from('water_logs').insert({ user_id: userId, ml });
  if (error) throw error;
}

/** Součet vypité vody dnes v ml. */
export async function getTodayWaterMl(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('water_logs')
    .select('ml')
    .gte('logged_at', start.toISOString());
  if (error) throw error;
  return (data ?? []).reduce((sum, r) => sum + (r.ml as number), 0);
}

/* -------------------------------------------------------------------------- */
/* Váha (F-07)                                                                 */
/* -------------------------------------------------------------------------- */

export interface WeightRow {
  logged_on: string;
  weight_kg: number;
}

/** Jeden záznam na den, přepisovatelný. */
export async function upsertWeight(userId: string, weightKg: number, loggedOn?: string): Promise<void> {
  const logged_on = loggedOn ?? new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('weight_logs')
    .upsert({ user_id: userId, logged_on, weight_kg: weightKg }, { onConflict: 'user_id,logged_on' });
  if (error) throw error;
}

/** Smaže záznam váhy podle dne (RLS pustí jen vlastní). */
export async function deleteWeight(loggedOn: string): Promise<void> {
  const { error } = await supabase.from('weight_logs').delete().eq('logged_on', loggedOn);
  if (error) throw error;
}

export async function listWeights(limitDays = 60): Promise<WeightRow[]> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('logged_on, weight_kg')
    .order('logged_on', { ascending: true })
    .limit(limitDays);
  if (error) throw error;
  return (data ?? []).map((r) => ({ logged_on: r.logged_on as string, weight_kg: Number(r.weight_kg) }));
}

/** Zda si uživatel dnes zapsal váhu (pro XP odměnu). */
export async function hasWeighedToday(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('weight_logs')
    .select('logged_on')
    .eq('logged_on', today)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/* -------------------------------------------------------------------------- */
/* Herní stav – XP, level, série (fáze 6)                                      */
/* -------------------------------------------------------------------------- */

export interface AvatarStateRow {
  level: number;
  xp: number;
  streak_days: number;
  streak_saves_left: number;
  streak_month: string | null;
  last_active_on: string | null;
}

export async function getAvatarState(): Promise<AvatarStateRow | null> {
  const { data, error } = await supabase
    .from('avatar_state')
    .select('level, xp, streak_days, streak_saves_left, streak_month, last_active_on')
    .maybeSingle();
  if (error) throw error;
  return (data as AvatarStateRow | null) ?? null;
}

export async function saveAvatarState(userId: string, state: AvatarStateRow): Promise<void> {
  const { error } = await supabase
    .from('avatar_state')
    .upsert({ user_id: userId, ...state }, { onConflict: 'user_id' });
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Vstupy pro eskalaci (nutrition-analyst, 8.1)                                 */
/* -------------------------------------------------------------------------- */

/** Denní kcal za posledních `days` dní (jen dny se zápisem, z v_daily_totals). */
export async function getRecentDailyKcal(days = 5): Promise<{ date: string; kcal: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const { data, error } = await supabase
    .from('v_daily_totals')
    .select('entry_date, kcal')
    .gte('entry_date', since.toISOString().slice(0, 10))
    .order('entry_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ date: r.entry_date as string, kcal: Number(r.kcal) }));
}

export async function getProfileHeightCm(): Promise<number | null> {
  const { data, error } = await supabase.from('profiles').select('height_cm').maybeSingle();
  if (error) throw error;
  return data?.height_cm != null ? Number(data.height_cm) : null;
}

export async function getLatestWeightKg(): Promise<number | null> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('weight_kg, logged_on')
    .order('logged_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.weight_kg != null ? Number(data.weight_kg) : null;
}

/* -------------------------------------------------------------------------- */
/* Plány jídel (F-12)                                                          */
/* -------------------------------------------------------------------------- */

export interface MealPlanRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

export interface MealPlanItem {
  id: string;
  planDate: string;
  meal: MealType;
  foodId: string | null;
  recipeId: string | null;
  grams: number | null;
  servings: number | null;
  name: string;
  /** Výživa potraviny na 100 g; u položek s receptem je null (řeší se přes recept). */
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
}

/** Přidá `days` dní k datu ve formátu YYYY-MM-DD. */
function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Vytvoří plán na `weeks` (1 až 4) týdnů od `startDate`. Vrací id plánu. */
export async function createMealPlan(userId: string, name: string, startDate: string, weeks: number): Promise<string> {
  const w = Math.min(4, Math.max(1, Math.round(weeks)));
  const endDate = addDays(startDate, w * 7 - 1);
  const { data, error } = await supabase
    .from('meal_plans')
    .insert({ user_id: userId, name: name.trim().slice(0, 200), start_date: startDate, end_date: endDate })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function listMealPlans(): Promise<MealPlanRow[]> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('id, name, start_date, end_date')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MealPlanRow[];
}

export async function deleteMealPlan(planId: string): Promise<void> {
  const { error } = await supabase.from('meal_plans').delete().eq('id', planId);
  if (error) throw error;
}

/** Položky plánu i s názvem a výživou potraviny (recept jen id + název). */
export async function getMealPlanItems(planId: string): Promise<MealPlanItem[]> {
  const { data, error } = await supabase
    .from('meal_plan_items')
    .select(
      'id, plan_date, meal, grams, servings, food_id, recipe_id, foods(name, kcal_100g, protein_100g, carbs_100g, fat_100g), recipes(name)',
    )
    .eq('meal_plan_id', planId)
    .order('plan_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => {
    const food = (Array.isArray(r.foods) ? r.foods[0] : r.foods) as Record<string, unknown> | null;
    const recipe = (Array.isArray(r.recipes) ? r.recipes[0] : r.recipes) as Record<string, unknown> | null;
    return {
      id: String(r.id),
      planDate: String(r.plan_date),
      meal: r.meal as MealType,
      foodId: r.food_id != null ? String(r.food_id) : null,
      recipeId: r.recipe_id != null ? String(r.recipe_id) : null,
      grams: r.grams != null ? Number(r.grams) : null,
      servings: r.servings != null ? Number(r.servings) : null,
      name: String(food?.name ?? recipe?.name ?? '?'),
      kcal_100g: food?.kcal_100g != null ? Number(food.kcal_100g) : null,
      protein_100g: food?.protein_100g != null ? Number(food.protein_100g) : null,
      carbs_100g: food?.carbs_100g != null ? Number(food.carbs_100g) : null,
      fat_100g: food?.fat_100g != null ? Number(food.fat_100g) : null,
    };
  });
}

export interface MealPlanItemInput {
  planDate: string;
  meal: MealType;
  foodId?: string;
  grams?: number;
  recipeId?: string;
  servings?: number;
}

/** Přidá položku do plánu (potravina s gramáží, nebo recept s počtem porcí). */
export async function addMealPlanItem(planId: string, item: MealPlanItemInput): Promise<void> {
  const { error } = await supabase.from('meal_plan_items').insert({
    meal_plan_id: planId,
    plan_date: item.planDate,
    meal: item.meal,
    ...(item.foodId ? { food_id: item.foodId, grams: item.grams } : {}),
    ...(item.recipeId ? { recipe_id: item.recipeId, servings: item.servings } : {}),
  });
  if (error) throw error;
}

export async function deleteMealPlanItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('meal_plan_items').delete().eq('id', itemId);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* AI návrh jídelníčku na den (suggest-plan)                                   */
/* -------------------------------------------------------------------------- */

export interface SuggestedItem {
  name: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}
export interface SuggestedMeal {
  meal: MealType;
  items: SuggestedItem[];
}
export interface DaySuggestion {
  meals: SuggestedMeal[];
  notes?: string;
}

const MEAL_SET: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Zavolá výživového poradce (Gemini) a vrátí návrh jídelníčku na jeden den. */
export async function suggestDay(opts?: { allergies?: string; available?: string }): Promise<DaySuggestion> {
  const { data, error } = await supabase.functions.invoke('suggest-plan', {
    method: 'POST',
    body: { allergies: opts?.allergies ?? '', available: opts?.available ?? '' },
  });
  if (error) throw error;
  const d = data as { status?: string; error?: string; meals?: unknown[]; notes?: string };
  if (!d || d.status !== 'done' || !Array.isArray(d.meals)) throw new Error(d?.error ?? 'failed');
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const meals: SuggestedMeal[] = (d.meals as Record<string, unknown>[]).map((m) => ({
    meal: MEAL_SET.includes(m.meal as MealType) ? (m.meal as MealType) : 'snack',
    items: (Array.isArray(m.items) ? (m.items as Record<string, unknown>[]) : []).map((it) => ({
      name: String(it.name ?? '').slice(0, 200),
      grams: num(it.grams) || 100,
      kcal_100g: Math.min(900, Math.max(0, num(it.kcal_100g))),
      protein_100g: num(it.protein_100g),
      carbs_100g: num(it.carbs_100g),
      fat_100g: num(it.fat_100g),
    })),
  }));
  return { meals, notes: typeof d.notes === 'string' ? d.notes : undefined };
}

/** Navrhne pár alternativ k jedné položce jídla (výběr nahradí původní). */
export async function suggestAlternatives(opts: {
  name: string;
  meal: MealType;
  grams: number;
  allergies?: string;
}): Promise<SuggestedItem[]> {
  const { data, error } = await supabase.functions.invoke('suggest-alternatives', {
    method: 'POST',
    body: { name: opts.name, meal: opts.meal, grams: opts.grams, allergies: opts.allergies ?? '' },
  });
  if (error) throw error;
  const d = data as { status?: string; alternatives?: unknown[] };
  if (!d || d.status !== 'done' || !Array.isArray(d.alternatives)) throw new Error('failed');
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return (d.alternatives as Record<string, unknown>[]).map((it) => ({
    name: String(it.name ?? '').slice(0, 200),
    grams: num(it.grams) || 100,
    kcal_100g: Math.min(900, Math.max(0, num(it.kcal_100g))),
    protein_100g: num(it.protein_100g),
    carbs_100g: num(it.carbs_100g),
    fat_100g: num(it.fat_100g),
  }));
}

/* -------------------------------------------------------------------------- */
/* AI generátor receptů (suggest-recipes)                                      */
/* -------------------------------------------------------------------------- */

export interface SuggestedRecipe {
  name: string;
  steps: string[];
  ingredients: SuggestedItem[];
}

/** Zavolá výživového poradce a vrátí 3 návrhy receptů podle fáze jídla a surovin. */
export async function suggestRecipes(opts: {
  meal: MealType;
  ingredients: string;
  allergies?: string;
}): Promise<SuggestedRecipe[]> {
  const { data, error } = await supabase.functions.invoke('suggest-recipes', {
    method: 'POST',
    body: { meal: opts.meal, ingredients: opts.ingredients, allergies: opts.allergies ?? '' },
  });
  if (error) throw error;
  const d = data as { status?: string; error?: string; recipes?: unknown[] };
  if (!d || d.status !== 'done' || !Array.isArray(d.recipes)) throw new Error(d?.error ?? 'failed');
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return (d.recipes as Record<string, unknown>[]).map((r) => ({
    name: String(r.name ?? '').slice(0, 200),
    steps: (Array.isArray(r.steps) ? r.steps : []).map((x) => String(x)).filter(Boolean),
    ingredients: (Array.isArray(r.ingredients) ? (r.ingredients as Record<string, unknown>[]) : []).map((it) => ({
      name: String(it.name ?? '').slice(0, 200),
      grams: num(it.grams) || 100,
      kcal_100g: Math.min(900, Math.max(0, num(it.kcal_100g))),
      protein_100g: num(it.protein_100g),
      carbs_100g: num(it.carbs_100g),
      fat_100g: num(it.fat_100g),
    })),
  }));
}

/**
 * Uloží vygenerovaný recept do „Moje recepty". Protože recipe_ingredients
 * vyžadují reálnou potravinu (food_id, NOT NULL), založí pro každou surovinu
 * vlastní potravinu uživatele a teprve pak recept, i s postupem. servings = 1
 * (jedna porce daného jídla). Vrací id receptu.
 */
export async function saveGeneratedRecipe(
  userId: string,
  recipe: SuggestedRecipe,
  meal?: MealType | null,
): Promise<string> {
  if (recipe.ingredients.length === 0) throw new Error('Recept nemá žádné ingredience.');
  const ing: { foodId: string; grams: number }[] = [];
  for (const it of recipe.ingredients) {
    const food = await createUserFood(userId, {
      name: it.name,
      kcal_100g: it.kcal_100g,
      protein_100g: it.protein_100g,
      carbs_100g: it.carbs_100g,
      fat_100g: it.fat_100g,
    });
    ing.push({ foodId: food.id, grams: it.grams });
  }
  return saveRecipe(userId, recipe.name, 1, ing, recipe.steps.join('\n'), meal ?? null);
}

/* -------------------------------------------------------------------------- */
/* GDPR – export dat (N-06) a smazání účtu                                     */
/* -------------------------------------------------------------------------- */

/**
 * Stáhne všechna osobní data přihlášeného uživatele přes RLS (žádné zvýšené
 * oprávnění). Tabulky vázané na rodiče (např. recipe_ingredients) se omezí na
 * potomky vlastních záznamů, aby export neobsahoval cizí ani veřejná data.
 * Rodiče se načítají dřív než potomci (viz exportOrder), takže jsou po ruce
 * jejich id.
 */
export async function exportMyData(userId: string, email?: string): Promise<ExportDocument> {
  const rows: Record<string, unknown[]> = {};
  const parentIds: Record<string, string[]> = {};

  for (const table of exportOrder()) {
    const spec = TABLE_SPECS.find((s) => s.table === table)!;
    if (spec.ownerColumn) {
      const { data, error } = await supabase.from(table).select('*').eq(spec.ownerColumn, userId);
      if (error) throw error;
      const list = (data ?? []) as Array<{ id?: string }>;
      rows[table] = list;
      parentIds[table] = list.map((r) => r.id).filter((v): v is string => typeof v === 'string');
    } else if (spec.parent) {
      const ids = parentIds[spec.parent.table] ?? [];
      if (ids.length === 0) {
        rows[table] = [];
        continue;
      }
      const { data, error } = await supabase.from(table).select('*').in(spec.parent.fk, ids);
      if (error) throw error;
      rows[table] = (data ?? []) as unknown[];
    }
  }

  return buildExport({ userId, email, generatedAt: new Date().toISOString() }, rows);
}

export interface DeleteAccountResult {
  status: string;
  deleted?: Record<string, number>;
}

/**
 * Zavolá Edge Function `delete-account`, která se service_role klíčem smaže
 * účet i všechna data. Po úspěchu se klient odhlásí. Nevratná operace –
 * potvrzení řeší obrazovka.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { data, error } = await supabase.functions.invoke<DeleteAccountResult>('delete-account', {
    method: 'POST',
  });
  if (error) throw error;
  await supabase.auth.signOut();
  return data ?? { status: 'deleted' };
}
