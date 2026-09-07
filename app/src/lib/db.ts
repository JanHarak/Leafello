/**
 * Datová vrstva nad Supabase: profil, cíl a deník. Všechno je chráněné RLS
 * (uživatel vidí a zapisuje jen svá data), klient posílá JWT automaticky.
 */
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
