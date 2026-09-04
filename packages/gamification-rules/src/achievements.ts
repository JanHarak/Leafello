/**
 * Katalog odznaků.
 *
 * Typ `AchievementTrigger` je zúžený tak, aby **nešlo napsat odznak za
 * restrikci.** Nejde o dokumentaci dobrého úmyslu: spouštěče jako
 * "kalorický deficit" nebo "zhubnutých kilogramů" v typu neexistují,
 * takže takový odznak neprojde kompilací.
 *
 * Kdyby to bylo jen pravidlo v komentáři, někdo ho za rok obejde
 * s nejlepším úmyslem a odůvodněním, že uživatelé si to přejí.
 */

/** Povolené spouštěče. Všechny se týkají zapisování, nikdy obsahu jídla. */
export type AchievementTrigger =
  | { kind: 'logged_days_total'; count: number }
  | { kind: 'streak_days'; count: number }
  | { kind: 'water_goal_days'; count: number }
  | { kind: 'weigh_ins_total'; count: number }
  | { kind: 'recipes_created'; count: number }
  | { kind: 'barcode_scans'; count: number }
  | { kind: 'photo_analyses'; count: number }
  | { kind: 'level_reached'; count: number };

export interface Achievement {
  code: string;
  /** Klíč do slovníku. Název a popis se skládají v aplikaci. */
  messageKey: string;
  trigger: AchievementTrigger;
  xpReward: number;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { code: 'first_entry', messageKey: 'achievement.firstEntry', trigger: { kind: 'logged_days_total', count: 1 }, xpReward: 10 },
  { code: 'week_logged', messageKey: 'achievement.weekLogged', trigger: { kind: 'streak_days', count: 7 }, xpReward: 25 },
  { code: 'month_logged', messageKey: 'achievement.monthLogged', trigger: { kind: 'streak_days', count: 30 }, xpReward: 100 },
  { code: 'hundred_days', messageKey: 'achievement.hundredDays', trigger: { kind: 'logged_days_total', count: 100 }, xpReward: 200 },
  { code: 'hydrated_week', messageKey: 'achievement.hydratedWeek', trigger: { kind: 'water_goal_days', count: 7 }, xpReward: 25 },
  { code: 'hydrated_month', messageKey: 'achievement.hydratedMonth', trigger: { kind: 'water_goal_days', count: 30 }, xpReward: 75 },
  { code: 'ten_weigh_ins', messageKey: 'achievement.tenWeighIns', trigger: { kind: 'weigh_ins_total', count: 10 }, xpReward: 20 },
  { code: 'first_recipe', messageKey: 'achievement.firstRecipe', trigger: { kind: 'recipes_created', count: 1 }, xpReward: 15 },
  { code: 'five_recipes', messageKey: 'achievement.fiveRecipes', trigger: { kind: 'recipes_created', count: 5 }, xpReward: 40 },
  { code: 'scanner', messageKey: 'achievement.scanner', trigger: { kind: 'barcode_scans', count: 25 }, xpReward: 20 },
  { code: 'photographer', messageKey: 'achievement.photographer', trigger: { kind: 'photo_analyses', count: 10 }, xpReward: 20 },
  { code: 'level_five', messageKey: 'achievement.levelFive', trigger: { kind: 'level_reached', count: 5 }, xpReward: 50 },
];

/** Naměřené hodnoty, ze kterých se odznaky vyhodnocují. */
export type Counters = Record<AchievementTrigger['kind'], number>;

export function emptyCounters(): Counters {
  return {
    logged_days_total: 0,
    streak_days: 0,
    water_goal_days: 0,
    weigh_ins_total: 0,
    recipes_created: 0,
    barcode_scans: 0,
    photo_analyses: 0,
    level_reached: 0,
  };
}

/**
 * Vrátí odznaky, které uživatel právě získal.
 *
 * Už získané odznaky se nikdy nevrací znovu, ani když counter mezitím
 * klesl. Odznak je záznam o tom, co se stalo, ne odraz aktuálního stavu.
 * Série se dá přerušit, získaný odznak za měsíc zápisů ne.
 */
export function newlyEarned(
  counters: Counters,
  alreadyEarned: readonly string[],
): Achievement[] {
  const earned = new Set(alreadyEarned);
  return ACHIEVEMENTS.filter(
    (a) => !earned.has(a.code) && counters[a.trigger.kind] >= a.trigger.count,
  );
}
