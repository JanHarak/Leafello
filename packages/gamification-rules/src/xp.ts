/**
 * XP a levely.
 *
 * Jediné pravidlo, ze kterého se tady nesmí ustoupit: **odměňuje se
 * zapisování, ne restrikce.** Body za deficit, za nízký příjem nebo za
 * rychlost hubnutí by z aplikace udělaly nástroj, který u části uživatelů
 * podporuje nezdravé chování.
 *
 * Praktický důsledek: funkce, které počítají XP, **záměrně nedostanou
 * zapsané kalorie jako vstup.** Nejde o disciplínu, jde o to, že co není
 * ve vstupu, to nemůže výsledek ovlivnit. Kdyby tam kcal byly, dřív nebo
 * později je někdo použije.
 */

export type AwardCode =
  /** Zapsaný den, tedy alespoň dvě jídla. */
  | 'logged_day'
  /** Splněný pitný cíl. */
  | 'water_goal'
  /** Zvážení se. */
  | 'weigh_in'
  /** Dokončený celý týden zápisů. */
  | 'full_week'
  /** Vytvořený recept. */
  | 'recipe_created';

export const XP_AWARDS: Record<AwardCode, number> = {
  logged_day: 20,
  water_goal: 10,
  weigh_in: 5,
  full_week: 50,
  recipe_created: 15,
} as const;

/** Minimální počet jídel, aby se den počítal jako zapsaný. */
export const MIN_MEALS_FOR_LOGGED_DAY = 2;

/**
 * Vstup pro výpočet XP za den.
 *
 * Všimni si, co tady NENÍ: zapsané kalorie, cíl, ani váha. Vstup obsahuje
 * jen to, jestli uživatel zapisoval, ne kolik snědl.
 */
export interface DayActivity {
  /** Počet zapsaných jídel, nikoliv jejich obsah. */
  mealsLogged: number;
  waterGoalMet: boolean;
  weighedIn: boolean;
  recipesCreated: number;
  /** Délka série po zpracování dne. Slouží k bonusu za celý týden. */
  streakDays: number;
}

export interface Award {
  code: AwardCode;
  xp: number;
  /** Kolikrát byla odměna přiznána. U receptů může být víc než jednou. */
  count: number;
}

/**
 * Odměny za jeden den.
 *
 * Bonus za celý týden se přiznává, když série dosáhne násobku sedmi.
 * Ne za kalendářní týden: uživatel, který začne ve středu, si na bonus
 * nemá čekat do neděle.
 */
export function awardsForDay(activity: DayActivity): Award[] {
  const awards: Award[] = [];

  const dayLogged = activity.mealsLogged >= MIN_MEALS_FOR_LOGGED_DAY;
  if (dayLogged) {
    awards.push({ code: 'logged_day', xp: XP_AWARDS.logged_day, count: 1 });
  }

  if (activity.waterGoalMet) {
    awards.push({ code: 'water_goal', xp: XP_AWARDS.water_goal, count: 1 });
  }

  if (activity.weighedIn) {
    awards.push({ code: 'weigh_in', xp: XP_AWARDS.weigh_in, count: 1 });
  }

  if (activity.recipesCreated > 0) {
    awards.push({
      code: 'recipe_created',
      xp: XP_AWARDS.recipe_created * activity.recipesCreated,
      count: activity.recipesCreated,
    });
  }

  if (dayLogged && activity.streakDays > 0 && activity.streakDays % 7 === 0) {
    awards.push({ code: 'full_week', xp: XP_AWARDS.full_week, count: 1 });
  }

  return awards;
}

export function totalXp(awards: Award[]): number {
  return awards.reduce((sum, a) => sum + a.xp, 0);
}

/**
 * Přidá XP ke stávajícímu součtu.
 *
 * XP **nikdy neklesá.** Za překročení cíle se neodečítá, za vynechaný den
 * se neodečítá, za nic se neodečítá. Trest za jídlo je přesně ten
 * mechanismus, kterému se v této aplikaci vyhýbáme.
 */
export function addXp(currentXp: number, gained: number): number {
  if (gained < 0) {
    throw new Error('XP se nikdy neodečítá. Záporný přírůstek je chyba v kódu.');
  }
  return currentXp + gained;
}

/* -------------------------------------------------------------------------- */
/* Levely                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Hranice levelu: threshold(L) = 50 · L · (L + 1).
 *
 * L1 = 100, L2 = 300, L3 = 600, L4 = 1000. Kvadratický růst znamená, že
 * první levely přijdou rychle a další se prodlužují. Lineární křivka by
 * po měsíci dávala level 30 a číslo by přestalo něco znamenat.
 */
export function xpForLevel(level: number): number {
  if (level < 0 || !Number.isInteger(level)) {
    throw new Error(`Level musí být nezáporné celé číslo, dostal jsem ${level}`);
  }
  return 50 * level * (level + 1);
}

export function levelForXp(xp: number): number {
  if (xp < 0) throw new Error('XP nemůže být negativní.');
  // Řešení nerovnosti 50·L·(L+1) ≤ xp, tedy L ≤ (-1 + √(1 + xp/12,5)) / 2.
  const level = Math.floor((-1 + Math.sqrt(1 + xp / 12.5)) / 2);
  // Pojistka proti zaokrouhlení v plovoucí čárce na hranici levelu.
  if (xpForLevel(level + 1) <= xp) return level + 1;
  if (xpForLevel(level) > xp) return Math.max(0, level - 1);
  return Math.max(0, level);
}

export interface LevelProgress {
  level: number;
  xp: number;
  /** XP na začátku aktuálního levelu. */
  levelStartXp: number;
  /** XP potřebné na další level. */
  nextLevelXp: number;
  /** Podíl 0 až 1 do dalšího levelu. */
  progress: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const span = nextLevelXp - levelStartXp;
  return {
    level,
    xp,
    levelStartXp,
    nextLevelXp,
    progress: span > 0 ? (xp - levelStartXp) / span : 0,
  };
}
