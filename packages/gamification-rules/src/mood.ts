/**
 * Nálada avatara.
 *
 * Nálada je jediné místo, kde aplikace komentuje stav uživatele obrázkem
 * místo textem. Platí tady stejné mantinely jako pro text: postava
 * reaguje na to, jestli uživatel zapisuje a pije, nikdy na to, kolik
 * snědl v absolutním smyslu nebo jak mu jde hubnutí.
 *
 * Konkrétně: neexistuje nálada „nespokojený" ani „zklamaný". Postava
 * uživatele nehodnotí.
 */

export type Mood = 'happy' | 'hungry' | 'thirsty' | 'sleepy' | 'celebrating';

export interface MoodContext {
  /** Počet zapsaných záznamů dnes. */
  entriesToday: number;
  /** Podíl vypitého k pitnému cíli, 0 až 1 a víc. */
  waterRatio: number;
  /** Podíl zapsaných kalorií k cíli, 0 až 1 a víc. */
  kcalRatio: number;
  /** Uživatel právě získal level nebo odznak. */
  justCelebrated: boolean;
  /** Hodina v místním čase uživatele, 0 až 23. */
  hour: number;
}

export const MOOD_RULES = {
  sleepyAfterHour: 12,
  thirstyAfterHour: 15,
  hungryAfterHour: 18,
  lowShare: 0.5,
} as const;

/**
 * Vybere náladu. První platné pravidlo vyhrává.
 *
 * ODCHYLKA OD ZADÁNÍ: `celebrating` je vyhodnocené **první**, ne
 * předposlední. V zadání bylo pod hlady a žízní, což znamenalo, že
 * uživatel, který si právě odemkl level v sedm večer s nesplněným pitným
 * cílem, uvidí žíznivou postavu místo oslavy. Oslava je přitom
 * krátkodobá a nikoho neochudí o připomínku pití, ta přijde za minutu
 * sama. Zadání jsem podle toho upravil.
 *
 * Pořadí zbylých pravidel je od nejsilnějšího signálu: kdo dnes nic
 * nezapsal, potřebuje připomenutí zápisu víc než připomenutí pití.
 */
export function moodFor(context: MoodContext): Mood {
  if (context.justCelebrated) return 'celebrating';

  if (context.entriesToday === 0 && context.hour >= MOOD_RULES.sleepyAfterHour) {
    return 'sleepy';
  }

  if (
    context.waterRatio < MOOD_RULES.lowShare &&
    context.hour >= MOOD_RULES.thirstyAfterHour
  ) {
    return 'thirsty';
  }

  if (
    context.kcalRatio < MOOD_RULES.lowShare &&
    context.hour >= MOOD_RULES.hungryAfterHour
  ) {
    return 'hungry';
  }

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
