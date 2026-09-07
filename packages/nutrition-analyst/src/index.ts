/**
 * Detekce rizikového vzorce a eskalace (zadání 8.1).
 *
 * Tenhle balíček je záměrně restriktivní. Aplikace na hubnutí s daty
 * o příjmu je prostředí, kde neopatrnost může ublížit, a náklady na
 * opatrnost jsou skoro nulové. Když se objeví rizikový vzorec, aplikace
 * přestane dávat rady k příjmu, schová herní mechaniku a nabídne odbornou
 * pomoc.
 *
 * MVP pokrývá dva jasně detekovatelné vzorce z dostupných dat. Další
 * (rychlý pokles váhy, opakované nastavení cíle na dolní hranici) se
 * doplní, až budou data k dispozici.
 */

export const MIN_HEALTHY_BMI = 18.5;
export const LOW_INTAKE_RATIO = 0.5;
export const LOW_INTAKE_DAYS = 5;

export type EscalationReason = 'bmi_low' | 'sustained_low_intake';

export interface EscalationInput {
  /** Aktuální BMI, nebo null když ho neznáme. */
  bmi?: number | null;
  /**
   * Poměr zapsaného příjmu k cíli za poslední dny, chronologicky
   * (nejstarší první). `null` = den bez zápisu (řadu přerušuje).
   */
  recentDailyKcalRatios: (number | null)[];
}

export interface EscalationResult {
  escalated: boolean;
  reasons: EscalationReason[];
}

export function detectEscalation(input: EscalationInput): EscalationResult {
  const reasons: EscalationReason[] = [];

  if (typeof input.bmi === 'number' && input.bmi < MIN_HEALTHY_BMI) {
    reasons.push('bmi_low');
  }

  const ratios = input.recentDailyKcalRatios;
  if (ratios.length >= LOW_INTAKE_DAYS) {
    const lastN = ratios.slice(-LOW_INTAKE_DAYS);
    const allLow = lastN.every((r) => typeof r === 'number' && r < LOW_INTAKE_RATIO);
    if (allLow) reasons.push('sustained_low_intake');
  }

  return { escalated: reasons.length > 0, reasons };
}
