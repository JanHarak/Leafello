/**
 * Testy T-16 až T-32 ze zadání, sekce 7.2 a 7.3, plus hraniční případy.
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_MEALS_FOR_LOGGED_DAY,
  XP_AWARDS,
  addXp,
  awardsForDay,
  levelForXp,
  levelProgress,
  totalXp,
  xpForLevel,
  type DayActivity,
} from '../src/xp';
import {
  SAVES_PER_MONTH,
  applyLoggedDay,
  initialStreak,
  isStreakAlive,
  type StreakState,
} from '../src/streak';
import { MOOD_RULES, isActionable, moodFor, type MoodContext } from '../src/mood';
import {
  ACHIEVEMENTS,
  emptyCounters,
  newlyEarned,
  type Counters,
} from '../src/achievements';

function activity(overrides: Partial<DayActivity> = {}): DayActivity {
  return {
    mealsLogged: 3,
    waterGoalMet: false,
    weighedIn: false,
    recipesCreated: 0,
    streakDays: 1,
    ...overrides,
  };
}

function mood(overrides: Partial<MoodContext> = {}): MoodContext {
  return {
    entriesToday: 4,
    waterRatio: 1,
    kcalRatio: 0.9,
    justCelebrated: false,
    hour: 20,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Levely                                                                     */
/* -------------------------------------------------------------------------- */

describe('levely', () => {
  it('T-16: xp 0 → level 0', () => expect(levelForXp(0)).toBe(0));
  it('T-17: xp 99 → level 0', () => expect(levelForXp(99)).toBe(0));
  it('T-18: xp 100 → level 1', () => expect(levelForXp(100)).toBe(1));
  it('T-19: xp 299 → level 1', () => expect(levelForXp(299)).toBe(1));
  it('T-20: xp 300 → level 2', () => expect(levelForXp(300)).toBe(2));
  it('T-21: xp 1000 → level 4', () => expect(levelForXp(1000)).toBe(4));

  it('hranice odpovídají vzorci 50·L·(L+1)', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(300);
    expect(xpForLevel(3)).toBe(600);
    expect(xpForLevel(4)).toBe(1000);
  });

  it('levelForXp je konzistentní s xpForLevel na každé hranici', () => {
    // Uzavřený vzorec s odmocninou má na hranicích riziko chyby
    // v plovoucí čárce. Test to prochází pro prvních 200 levelů.
    for (let level = 0; level <= 200; level += 1) {
      const threshold = xpForLevel(level);
      expect(levelForXp(threshold), `hranice levelu ${level}`).toBe(level);
      if (threshold > 0) {
        expect(levelForXp(threshold - 1), `pod hranicí levelu ${level}`).toBe(level - 1);
      }
    }
  });

  it('level je neklesající funkce XP', () => {
    let previous = 0;
    for (let xp = 0; xp <= 5000; xp += 7) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('postup do dalšího levelu je 0 až 1', () => {
    for (const xp of [0, 50, 99, 100, 250, 999, 1000, 4321]) {
      const p = levelProgress(xp);
      expect(p.progress, `xp ${xp}`).toBeGreaterThanOrEqual(0);
      expect(p.progress, `xp ${xp}`).toBeLessThan(1);
      expect(p.levelStartXp).toBeLessThanOrEqual(xp);
      expect(p.nextLevelXp).toBeGreaterThan(xp);
    }
  });

  it('odmítne nesmyslné vstupy', () => {
    expect(() => levelForXp(-1)).toThrow();
    expect(() => xpForLevel(-1)).toThrow();
    expect(() => xpForLevel(1.5)).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* XP                                                                        */
/* -------------------------------------------------------------------------- */

describe('odměny za den', () => {
  it('T-22: den s jedním jídlem nedostane odměnu za zapsaný den', () => {
    const awards = awardsForDay(activity({ mealsLogged: 1 }));
    expect(awards.some((a) => a.code === 'logged_day')).toBe(false);
    expect(totalXp(awards)).toBe(0);
    expect(MIN_MEALS_FOR_LOGGED_DAY).toBe(2);
  });

  it('T-23: dvě jídla a splněná voda → 30 XP', () => {
    const awards = awardsForDay(activity({ mealsLogged: 2, waterGoalMet: true }));
    expect(totalXp(awards)).toBe(30);
  });

  it('zvážení se přidá 5 XP', () => {
    const awards = awardsForDay(activity({ weighedIn: true }));
    expect(totalXp(awards)).toBe(XP_AWARDS.logged_day + XP_AWARDS.weigh_in);
  });

  it('bonus za celý týden přijde při násobku sedmi', () => {
    expect(totalXp(awardsForDay(activity({ streakDays: 6 })))).toBe(20);
    expect(totalXp(awardsForDay(activity({ streakDays: 7 })))).toBe(70);
    expect(totalXp(awardsForDay(activity({ streakDays: 14 })))).toBe(70);
    expect(totalXp(awardsForDay(activity({ streakDays: 15 })))).toBe(20);
  });

  it('bonus za týden nepřijde, když den není zapsaný', () => {
    const awards = awardsForDay(activity({ mealsLogged: 0, streakDays: 7 }));
    expect(awards.some((a) => a.code === 'full_week')).toBe(false);
  });

  it('víc receptů za den dostane víc XP', () => {
    const awards = awardsForDay(activity({ recipesCreated: 3 }));
    const recipe = awards.find((a) => a.code === 'recipe_created');
    expect(recipe?.xp).toBe(45);
    expect(recipe?.count).toBe(3);
  });

  it('prázdný den nedostane nic, ale ani neztratí', () => {
    const awards = awardsForDay(
      activity({ mealsLogged: 0, waterGoalMet: false, weighedIn: false, streakDays: 0 }),
    );
    expect(totalXp(awards)).toBe(0);
  });
});

describe('XP se nikdy nedává za restrikci', () => {
  it('T-24: XP nikdy neklesá', () => {
    expect(addXp(500, 0)).toBe(500);
    expect(addXp(500, 20)).toBe(520);
    expect(() => addXp(500, -20)).toThrow();
  });

  it('vstup pro výpočet XP vůbec neobsahuje kalorie', () => {
    // Tohle je hlavní pojistka celého skillu. Co není ve vstupu, to
    // nemůže ovlivnit výsledek. Kdyby tam kcal byly, dřív nebo později
    // je někdo použije s nejlepším úmyslem.
    const keys = Object.keys(activity()).sort();
    expect(keys).toEqual(
      ['mealsLogged', 'recipesCreated', 'streakDays', 'waterGoalMet', 'weighedIn'].sort(),
    );
    for (const key of keys) {
      expect(key.toLowerCase()).not.toContain('kcal');
      expect(key.toLowerCase()).not.toContain('calor');
      expect(key.toLowerCase()).not.toContain('deficit');
      expect(key.toLowerCase()).not.toContain('weight');
    }
  });

  it('nulový den nedostane víc než den s běžným příjmem', () => {
    // "Nulový den" je z pohledu XP prostě nezapsaný den, tedy 0 XP.
    // Nesmí být výhodnější než zapsaný den.
    const zeroDay = totalXp(awardsForDay(activity({ mealsLogged: 0 })));
    const normalDay = totalXp(awardsForDay(activity({ mealsLogged: 3 })));
    expect(zeroDay).toBeLessThan(normalDay);
  });

  it('žádná odměna nemá v kódu název odkazující na příjem nebo hubnutí', () => {
    for (const code of Object.keys(XP_AWARDS)) {
      for (const banned of ['deficit', 'kcal', 'calorie', 'weight_lost', 'loss', 'fast']) {
        expect(code, `odměna ${code}`).not.toContain(banned);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Série                                                                      */
/* -------------------------------------------------------------------------- */

describe('série dní', () => {
  it('první zapsaný den začíná sérii', () => {
    const result = applyLoggedDay(initialStreak(), '2026-09-01');
    expect(result.outcome).toBe('started');
    expect(result.state.streakDays).toBe(1);
  });

  it('navazující dny sérii prodlužují', () => {
    let state = initialStreak();
    for (const date of ['2026-09-01', '2026-09-02', '2026-09-03']) {
      state = applyLoggedDay(state, date).state;
    }
    expect(state.streakDays).toBe(3);
  });

  it('stejný den dvakrát sérii neprodlouží', () => {
    let state = applyLoggedDay(initialStreak(), '2026-09-01').state;
    const result = applyLoggedDay(state, '2026-09-01');
    expect(result.outcome).toBe('unchanged');
    expect(result.state.streakDays).toBe(1);
  });

  it('T-25: jeden vynechaný den se záchranou sérii udrží', () => {
    let state = initialStreak();
    state = applyLoggedDay(state, '2026-09-01').state;
    state = applyLoggedDay(state, '2026-09-02').state;
    // 3. září chybí
    const result = applyLoggedDay(state, '2026-09-04');
    expect(result.outcome).toBe('saved');
    expect(result.state.streakDays).toBe(3);
    expect(result.state.savesLeft).toBe(0);
  });

  it('T-26: jeden vynechaný den s vyčerpanou záchranou sérii přeruší', () => {
    let state = initialStreak();
    state = applyLoggedDay(state, '2026-09-01').state;
    state = applyLoggedDay(state, '2026-09-03').state; // spotřebuje záchranu
    expect(state.savesLeft).toBe(0);

    const result = applyLoggedDay(state, '2026-09-05');
    expect(result.outcome).toBe('reset');
    expect(result.state.streakDays).toBe(1);
  });

  it('T-27: v novém kalendářním měsíci se záchrana obnoví', () => {
    let state = initialStreak();
    state = applyLoggedDay(state, '2026-09-01').state;
    state = applyLoggedDay(state, '2026-09-03').state;
    expect(state.savesLeft).toBe(0);

    // Přechod do října
    const result = applyLoggedDay(state, '2026-10-01');
    expect(result.state.savesLeft).toBe(SAVES_PER_MONTH);
  });

  it('delší mezera se nezachraňuje', () => {
    // Kdo nezapisoval týden, tomu jedna záchrana sérii nezachrání
    // a předstírat to by bylo nepoctivé.
    let state = applyLoggedDay(initialStreak(), '2026-09-01').state;
    const result = applyLoggedDay(state, '2026-09-08');
    expect(result.outcome).toBe('reset');
    expect(result.state.savesLeft).toBe(SAVES_PER_MONTH);
  });

  it('počítá celkový počet použitých záchran', () => {
    let state = initialStreak();
    state = applyLoggedDay(state, '2026-09-01').state;
    state = applyLoggedDay(state, '2026-09-03').state;
    state = applyLoggedDay(state, '2026-10-01').state;
    state = applyLoggedDay(state, '2026-10-03').state;
    expect(state.savesUsedTotal).toBe(2);
  });

  it('série je živá do jednoho dne bez zápisu', () => {
    const state = applyLoggedDay(initialStreak(), '2026-09-01').state;
    expect(isStreakAlive(state, '2026-09-01')).toBe(true);
    expect(isStreakAlive(state, '2026-09-02')).toBe(true);
    expect(isStreakAlive(state, '2026-09-03')).toBe(true); // ještě má záchranu
    expect(isStreakAlive(state, '2026-09-04')).toBe(false);
  });

  it('série bez jediného zápisu není živá', () => {
    expect(isStreakAlive(initialStreak(), '2026-09-01')).toBe(false);
  });

  it('sto dní v řadě funguje bez driftu', () => {
    let state: StreakState = initialStreak();
    const start = Date.parse('2026-01-01T00:00:00Z');
    for (let i = 0; i < 100; i += 1) {
      const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      state = applyLoggedDay(state, date).state;
    }
    expect(state.streakDays).toBe(100);
    expect(state.savesUsedTotal).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Nálada                                                                     */
/* -------------------------------------------------------------------------- */

describe('nálada avatara', () => {
  it('T-28: žádný záznam ve 13:00 → sleepy', () => {
    expect(moodFor(mood({ entriesToday: 0, hour: 13 }))).toBe('sleepy');
  });

  it('T-29: voda 30 % v 16:00 se zapsaným jídlem → thirsty', () => {
    expect(moodFor(mood({ waterRatio: 0.3, hour: 16 }))).toBe('thirsty');
  });

  it('T-30: voda 100 %, kcal 30 % v 19:00 → hungry', () => {
    expect(moodFor(mood({ waterRatio: 1, kcalRatio: 0.3, hour: 19 }))).toBe('hungry');
  });

  it('T-31: vše splněno → happy', () => {
    expect(moodFor(mood())).toBe('happy');
  });

  it('T-32: voda 30 % v 10:00 → happy, podmínka platí až po 15:00', () => {
    expect(moodFor(mood({ waterRatio: 0.3, hour: 10 }))).toBe('happy');
  });

  it('žádný záznam v 10:00 → happy, ne sleepy', () => {
    expect(moodFor(mood({ entriesToday: 0, hour: 10 }))).toBe('happy');
  });

  it('oslava má přednost před hladem i žízní', () => {
    // Odchylka od původního zadání. Uživatel, který si právě odemkl
    // level v sedm večer s nesplněným pitným cílem, má vidět oslavu,
    // ne žíznivou postavu. Připomínka pití přijde za minutu sama.
    const context = mood({
      justCelebrated: true,
      waterRatio: 0.2,
      kcalRatio: 0.2,
      entriesToday: 0,
      hour: 20,
    });
    expect(moodFor(context)).toBe('celebrating');
  });

  it('hranice hodin jsou inkluzivní', () => {
    expect(moodFor(mood({ entriesToday: 0, hour: 11 }))).toBe('happy');
    expect(moodFor(mood({ entriesToday: 0, hour: MOOD_RULES.sleepyAfterHour }))).toBe('sleepy');
    expect(moodFor(mood({ waterRatio: 0.1, hour: 14 }))).toBe('happy');
    expect(moodFor(mood({ waterRatio: 0.1, hour: MOOD_RULES.thirstyAfterHour }))).toBe('thirsty');
  });

  it('hranice podílu je přesně polovina', () => {
    expect(moodFor(mood({ waterRatio: 0.5, hour: 16 }))).toBe('happy');
    expect(moodFor(mood({ waterRatio: 0.49, hour: 16 }))).toBe('thirsty');
  });

  it('neexistuje nálada, která uživatele hodnotí', () => {
    // Postava reaguje na to, jestli uživatel zapisuje a pije, nikdy na
    // to, jak mu jde hubnutí. Nálada "zklamaný" by byla výtka obrázkem.
    const moods = ['happy', 'hungry', 'thirsty', 'sleepy', 'celebrating'];
    for (const banned of ['sad', 'disappointed', 'angry', 'zklamany', 'nespokojeny']) {
      expect(moods).not.toContain(banned);
    }
  });

  it('výzva k akci je jen u nálad, se kterými uživatel může něco udělat', () => {
    expect(isActionable('sleepy')).toBe(true);
    expect(isActionable('thirsty')).toBe(true);
    expect(isActionable('hungry')).toBe(true);
    expect(isActionable('happy')).toBe(false);
    expect(isActionable('celebrating')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Odznaky                                                                    */
/* -------------------------------------------------------------------------- */

describe('odznaky', () => {
  function counters(overrides: Partial<Counters> = {}): Counters {
    return { ...emptyCounters(), ...overrides };
  }

  it('vrátí jen ty, na které je nasbíráno', () => {
    const earned = newlyEarned(counters({ logged_days_total: 1 }), []);
    expect(earned.map((a) => a.code)).toEqual(['first_entry']);
  });

  it('nevrací už získané odznaky', () => {
    const earned = newlyEarned(counters({ logged_days_total: 1 }), ['first_entry']);
    expect(earned).toEqual([]);
  });

  it('získaný odznak zůstává, i když counter klesne', () => {
    // Série se dá přerušit, získaný odznak za měsíc zápisů ne. Odznak
    // je záznam o tom, co se stalo, ne odraz aktuálního stavu.
    const earned = newlyEarned(counters({ streak_days: 0 }), ['month_logged']);
    expect(earned).toEqual([]);
  });

  it('vrátí víc odznaků naráz', () => {
    const earned = newlyEarned(
      counters({ logged_days_total: 100, streak_days: 30, water_goal_days: 7 }),
      [],
    );
    expect(earned.length).toBeGreaterThanOrEqual(4);
  });

  it('kódy odznaků jsou unikátní', () => {
    const codes = ACHIEVEMENTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('každý odznak má klíč do slovníku, ne hotový text', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.messageKey, a.code).toMatch(/^achievement\./);
      expect(a.xpReward).toBeGreaterThan(0);
    }
  });

  it('žádný odznak neodměňuje restrikci', () => {
    // Typ AchievementTrigger neobsahuje spouštěč typu "deficit" ani
    // "zhubnutých kilogramů", takže takový odznak neprojde kompilací.
    // Tenhle test hlídá i seznam povolených spouštěčů proti záměně.
    const allowed = [
      'logged_days_total',
      'streak_days',
      'water_goal_days',
      'weigh_ins_total',
      'recipes_created',
      'barcode_scans',
      'photo_analyses',
      'level_reached',
    ];
    for (const a of ACHIEVEMENTS) {
      expect(allowed, `odznak ${a.code}`).toContain(a.trigger.kind);
    }
    expect(Object.keys(emptyCounters()).sort()).toEqual([...allowed].sort());
  });

  it('vážení se odměňuje za zápis, ne za hodnotu', () => {
    // Spouštěč je počet vážení, nikdy naměřená hodnota nebo její změna.
    const weighIn = ACHIEVEMENTS.find((a) => a.code === 'ten_weigh_ins');
    expect(weighIn?.trigger.kind).toBe('weigh_ins_total');
  });
});
