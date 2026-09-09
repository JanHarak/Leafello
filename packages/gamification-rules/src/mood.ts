/**
 * Nálada avatara.
 *
 * Nálada je jediné místo, kde aplikace komentuje stav uživatele obrázkem
 * místo textem. Platí tady stejné mantinely jako pro text: postava
 * reaguje na to, jestli uživatel zapisuje a pije, nikdy na to, kolik
 * snědl v absolutním smyslu nebo jak mu jde hubnutí.
 *
 * Konkrétně: neexistuje nálada „nespokojený" ani „zklamaný". Postava
 * uživatele nehodnotí. Hlad ani žízeň nejsou výtka – jsou to připomínky
 * zápisu, a mizí, jakmile uživatel chod zapíše.
 */

export type Mood = 'happy' | 'hungry' | 'thirsty' | 'sleepy' | 'celebrating';

/**
 * Jedna jídelní fáze dne (snídaně / oběd / večeře). Určuje se z připomínek
 * uživatele a z toho, co má dnes zapsané.
 */
export interface MealPhase {
  /** Připomínka na tento chod už dnes pinkla (aktuální čas ≥ čas připomínky). */
  reminderPassed: boolean;
  /** Zapsané kcal pro tento chod dnes (součet záznamů daného jídla). */
  kcalLogged: number;
}

export interface MoodContext {
  /** Počet zapsaných záznamů dnes. */
  entriesToday: number;
  /** Podíl zapsaných kalorií k cíli, 0 až 1 a víc. */
  kcalRatio: number;
  /** Uživatel právě získal level nebo odznak. */
  justCelebrated: boolean;
  /** Hodina v místním čase uživatele, 0 až 23. */
  hour: number;
  /**
   * Jídelní fáze dne (snídaně, oběd, večeře) pro určení hladu. Prázdné pole
   * nebo neuvedeno = žádná data, avatar nehladoví.
   */
  mealPhases?: MealPhase[];
  /** Kolik ml vody má uživatel dnes vypito. */
  waterMl?: number;
  /**
   * Kolik ml plán očekává vypito „do teď" – součet porcí těch pitných
   * připomínek, které už dnes pinkly. Když je vypito méně, avatar žízní;
   * jakmile uživatel porci dožene (nebo pije napřed), žízeň zmizí.
   */
  waterExpectedMl?: number;
}

export const MOOD_RULES = {
  sleepyAfterHour: 12,
  // Chod se počítá za zapsaný, až když má víc než 100 kcal (drobná svačina
  // nebo omylem přidaná položka hlad „neuspokojí").
  mealLoggedKcal: 100,
  // Když má uživatel splněno ≥ 90 % kalorického cíle, hlad se NEZOBRAZUJE –
  // appka nikdy netlačí do jídla (viz gamification-rules: neodměňuje se ani
  // nevynucuje příjem). Práh je podíl z cíle, nikdy absolutní příjem.
  fullShare: 0.9,
} as const;

/**
 * Hlad: připomínka „zapiš si chod". Platí, když
 *  – uživatel ještě nemá splněno ≥ 90 % kalorického cíle (jinak by ho hlad
 *    tlačil k přejídání – to appka nedělá), a zároveň
 *  – u některé už proběhlé jídelní připomínky nemá zapsaný chod (> 100 kcal).
 *
 * Jakmile uživatel chod zapíše (> 100 kcal), daná fáze je uspokojená a hlad
 * u ní zmizí – do další jídelní připomínky.
 */
function isHungry(ctx: MoodContext): boolean {
  if (ctx.kcalRatio >= MOOD_RULES.fullShare) return false;
  const phases = ctx.mealPhases ?? [];
  return phases.some((p) => p.reminderPassed && p.kcalLogged <= MOOD_RULES.mealLoggedKcal);
}

/**
 * Žízeň: stejný fázový princip jako hlad, jen podle pitného plánu. Sčítá se,
 * kolik ml mají připomínky, které už dnes pinkly, dohromady „naordinovat"
 * (`waterExpectedMl`). Když má uživatel vypito míň, žízní; jakmile porci
 * dožene – nebo pije napřed a má náskok – žízeň zmizí až do dalšího slotu,
 * kdy očekávané množství zase povyskočí.
 */
function isThirsty(ctx: MoodContext): boolean {
  const expected = ctx.waterExpectedMl ?? 0;
  if (expected <= 0) return false;
  return (ctx.waterMl ?? 0) < expected;
}

/**
 * Vybere náladu. První platné pravidlo vyhrává.
 *
 * ODCHYLKA OD ZADÁNÍ: `celebrating` je vyhodnocené **první**, ne
 * předposlední. Uživatel, který si právě odemkl level v sedm večer
 * s nesplněným pitným cílem, má vidět oslavu, ne žíznivou postavu.
 *
 * Pořadí: kdo dnes nic nezapsal, potřebuje připomenutí zápisu nejvíc
 * (`sleepy`). Pak má **jídlo přednost před pitím** – deník jídel je hlavní
 * účel appky, takže `hungry` se vyhodnocuje před `thirsty`.
 */
export function moodFor(context: MoodContext): Mood {
  if (context.justCelebrated) return 'celebrating';

  if (context.entriesToday === 0 && context.hour >= MOOD_RULES.sleepyAfterHour) {
    return 'sleepy';
  }

  if (isHungry(context)) return 'hungry';

  if (isThirsty(context)) return 'thirsty';

  return 'happy';
}

/**
 * Nálady, které v UI nesou výzvu k akci. Ostatní jsou jen dekorace.
 * Používá se k rozhodnutí, jestli k postavě připojit tlačítko.
 */
export const ACTIONABLE_MOODS: readonly Mood[] = ['sleepy', 'thirsty', 'hungry'];

export function isActionable(mood: Mood): boolean {
  return ACTIONABLE_MOODS.includes(mood);
}

/**
 * Klíč do slovníku pro popis nálady. Text se skládá v aplikaci, tady
 * jen klíč, stejně jako v nutrition-analyst.
 */
export function moodMessageKey(mood: Mood): string {
  return `avatar.mood.${mood}`;
}
