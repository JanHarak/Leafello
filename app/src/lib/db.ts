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
export async function addDiaryEntry(userId: string, meal: MealType, grams: number, snapshot: DiarySnapshot): Promise<void> {
  const { error } = await supabase.from('diary_entries').insert({
    user_id: userId,
    meal,
    grams,
    snapshot,
  });
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
