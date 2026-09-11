/**
 * Sdílené datové helpery pro procházení dní (deník, pitný režim, …).
 * Den reprezentujeme jako ISO řetězec `YYYY-MM-DD` (UTC datum) – shodně s tím,
 * jak deník ukládá `entry_date`.
 */
import { t } from '@/i18n';

/** Dnešní den jako ISO `YYYY-MM-DD`. */
export const todayISO = (): string => new Date().toISOString().slice(0, 10);

/**
 * Posun ISO dne o `n` dní. Kotví se na poledne UTC, aby se nepřeskočila hranice
 * měsíce/roku ani se to nerozbilo kvůli letnímu času.
 */
export const shiftISO = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Popisek dne: `label` je „Dnes“ / „Včera“ / plné datum; když je label relativní
 * slovo, `sub` nese plné datum (jinak prázdné). `lang` řídí formát data.
 */
export function dayLabel(dateISO: string, lang: string): { label: string; sub: string } {
  const full = new Date(`${dateISO}T12:00:00Z`).toLocaleDateString(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const label =
    dateISO === todayISO()
      ? t('diary.today')
      : dateISO === shiftISO(todayISO(), -1)
        ? t('diary.yesterday')
        : full;
  return { label, sub: label === full ? '' : full };
}
