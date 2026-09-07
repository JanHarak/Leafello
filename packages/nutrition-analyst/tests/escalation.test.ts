/**
 * Testy detekce rizikového vzorce a eskalace (zadání 8.1).
 *
 * Když data ukazují rizikový vzorec, aplikace přestane dávat rady k příjmu,
 * schová herní mechaniku a nabídne odbornou pomoc. Tady se testuje jen
 * detekce; text a odkaz řeší aplikace.
 */
import { describe, it, expect } from 'vitest';
import {
  LOW_INTAKE_DAYS,
  LOW_INTAKE_RATIO,
  MIN_HEALTHY_BMI,
  detectEscalation,
} from '../src';

describe('detekce eskalace', () => {
  it('BMI pod 18,5 → eskalace (bmi_low)', () => {
    const r = detectEscalation({ bmi: 17.2, recentDailyKcalRatios: [] });
    expect(r.escalated).toBe(true);
    expect(r.reasons).toContain('bmi_low');
  });

  it('zdravé BMI a běžný příjem → bez eskalace', () => {
    const r = detectEscalation({ bmi: 22, recentDailyKcalRatios: [0.9, 1.0, 0.8, 1.1, 0.95] });
    expect(r.escalated).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it('5 zapsaných dní pod 50 % cíle → eskalace (sustained_low_intake)', () => {
    const r = detectEscalation({ bmi: 22, recentDailyKcalRatios: [0.4, 0.3, 0.45, 0.2, 0.49] });
    expect(r.escalated).toBe(true);
    expect(r.reasons).toContain('sustained_low_intake');
  });

  it('jen 4 dny pod 50 % → bez eskalace', () => {
    const r = detectEscalation({ bmi: 22, recentDailyKcalRatios: [0.4, 0.3, 0.2, 0.45] });
    expect(r.escalated).toBe(false);
  });

  it('jeden z 5 dní nad 50 % → bez eskalace', () => {
    const r = detectEscalation({ bmi: 22, recentDailyKcalRatios: [0.4, 0.3, 0.6, 0.2, 0.4] });
    expect(r.escalated).toBe(false);
  });

  it('nezapsaný den (null) přeruší řadu → bez eskalace', () => {
    const r = detectEscalation({ bmi: 22, recentDailyKcalRatios: [0.4, 0.3, null, 0.2, 0.4] });
    expect(r.escalated).toBe(false);
  });

  it('hranice: přesně 0,5 se nepočítá jako pod limitem', () => {
    const r = detectEscalation({ bmi: 22, recentDailyKcalRatios: [0.5, 0.5, 0.5, 0.5, 0.5] });
    expect(r.escalated).toBe(false);
  });

  it('kombinace: nízké BMI i dlouhodobě nízký příjem → obě příčiny', () => {
    const r = detectEscalation({ bmi: 17, recentDailyKcalRatios: [0.4, 0.4, 0.4, 0.4, 0.4] });
    expect(r.reasons).toContain('bmi_low');
    expect(r.reasons).toContain('sustained_low_intake');
  });

  it('chybějící BMI (null) se ignoruje', () => {
    const r = detectEscalation({ bmi: null, recentDailyKcalRatios: [0.9, 0.9] });
    expect(r.escalated).toBe(false);
  });

  it('konstanty odpovídají zadání', () => {
    expect(MIN_HEALTHY_BMI).toBe(18.5);
    expect(LOW_INTAKE_RATIO).toBe(0.5);
    expect(LOW_INTAKE_DAYS).toBe(5);
  });
});
