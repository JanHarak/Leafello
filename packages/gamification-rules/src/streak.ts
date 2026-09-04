/**
 * Série zapsaných dní.
 *
 * Návrhová zásada: série má motivovat, ne trestat. Brutální série, která
 * se po jednom zapomenutém dni vynuluje, vede k tomu, že uživatel appku
 * smaže. Zapomenutý den je totiž nejčastěji dovolená nebo nemoc, ne
 * ztráta motivace, a vynulovat za to dva měsíce práce je nespravedlivé.
 *
 * Proto jedna automatická záchrana za kalendářní měsíc.
 */

export interface StreakState {
  streakDays: number;
  /** ISO datum posledního zapsaného dne, nebo null na začátku. */
  lastLoggedOn: string | null;
  /** Zbývající záchrany. Vždy 0 nebo 1. */
  savesLeft: number;
  /** Měsíc, ke kterému se váže savesLeft, ve formátu 'YYYY-MM'. */
  savesMonth: string | null;
  /** Kolikrát byla záchrana celkem použita. Jen pro statistiku. */
  savesUsedTotal: number;
}

export const SAVES_PER_MONTH = 1;

export function initialStreak(): StreakState {
  return {
    streakDays: 0,
    lastLoggedOn: null,
    savesLeft: SAVES_PER_MONTH,
    savesMonth: null,
    savesUsedTotal: 0,
  };
}

function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Obnoví záchrany, když se přešlo do nového kalendářního měsíce. */
function refreshSaves(state: StreakState, date: string): StreakState {
  const month = monthOf(date);
  if (state.savesMonth === month) return state;
  return { ...state, savesLeft: SAVES_PER_MONTH, savesMonth: month };
}

export type StreakOutcome =
  /** První zapsaný den. */
  | 'started'
  /** Série pokračuje běžně. */
  | 'continued'
  /** Série pokračuje díky použité záchraně. */
  | 'saved'
  /** Série se přerušila a začala znovu. */
  | 'reset'
  /** Den už byl zpracovaný, nic se nezměnilo. */
  | 'unchanged';

export interface StreakResult {
  state: StreakState;
  outcome: StreakOutcome;
}

/**
 * Zpracuje jeden zapsaný den.
 *
 * Volá se jen pro dny, které se počítají jako zapsané. Nezapsané dny se
 * nezpracovávají vůbec, mezera se pozná z rozdílu datumů.
 *
 * Chování podle mezery od posledního zapsaného dne:
 * - 0 dní: den už byl zpracovaný, nic se nemění
 * - 1 den: série pokračuje
 * - 2 dny, tedy jeden vynechaný: použije se záchrana, pokud je
 * - 3 a víc dní: série začíná od jedničky
 *
 * Záchrana se **nepoužívá na delší mezery.** Kdo nezapisoval týden, tomu
 * jedna záchrana série nezachrání a předstírat to by bylo nepoctivé.
 */
export function applyLoggedDay(state: StreakState, date: string): StreakResult {
  const refreshed = refreshSaves(state, date);

  if (refreshed.lastLoggedOn === null) {
    return {
      state: { ...refreshed, streakDays: 1, lastLoggedOn: date },
      outcome: 'started',
    };
  }

  const gap = daysBetween(refreshed.lastLoggedOn, date);

  if (gap <= 0) {
    return { state: refreshed, outcome: 'unchanged' };
  }

  if (gap === 1) {
    return {
      state: { ...refreshed, streakDays: refreshed.streakDays + 1, lastLoggedOn: date },
      outcome: 'continued',
    };
  }

  if (gap === 2 && refreshed.savesLeft > 0) {
    return {
      state: {
        ...refreshed,
        streakDays: refreshed.streakDays + 1,
        lastLoggedOn: date,
        savesLeft: refreshed.savesLeft - 1,
        savesUsedTotal: refreshed.savesUsedTotal + 1,
      },
      outcome: 'saved',
    };
  }

  return {
    state: { ...refreshed, streakDays: 1, lastLoggedOn: date },
    outcome: 'reset',
  };
}

/**
 * Zjistí, jestli je série k danému dni ještě živá, bez zápisu.
 *
 * Používá se na zobrazení. Série se nepřerušuje v okamžiku, kdy hodiny
 * odbijí půlnoc, ale až když je mezera příliš velká na záchranu.
 */
export function isStreakAlive(state: StreakState, today: string): boolean {
  if (state.lastLoggedOn === null) return false;
  const gap = daysBetween(state.lastLoggedOn, today);
  const refreshed = refreshSaves(state, today);
  if (gap <= 1) return true;
  return gap === 2 && refreshed.savesLeft > 0;
}
