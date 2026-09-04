/**
 * Deduplikace podle čárového kódu a celá importní pipeline.
 *
 * Při shodném `barcode` se ponechá záznam s nejvíce vyplněnými poli,
 * ostatní se zahodí. Záznamy bez čárového kódu se nezlučují.
 */
import { normalizeFood, type NormalizedFood, type RawFood } from './validate';

/** Počet vyplněných polí, tj. hodnot, které nejsou null, undefined ani prázdný řetězec. */
export function completeness(record: Record<string, unknown>): number {
  return Object.values(record).filter(
    (v) => v !== null && v !== undefined && v !== '',
  ).length;
}

export function dedupeByBarcode<T extends { barcode?: string | null }>(records: T[]): T[] {
  const byBarcode = new Map<string, T>();
  const withoutBarcode: T[] = [];

  for (const record of records) {
    const barcode = record.barcode;
    if (barcode === null || barcode === undefined || barcode === '') {
      withoutBarcode.push(record);
      continue;
    }
    const existing = byBarcode.get(barcode);
    if (!existing || completeness(record) > completeness(existing)) {
      byBarcode.set(barcode, record);
    }
  }

  return [...withoutBarcode, ...byBarcode.values()];
}

/** Zvaliduje, znormalizuje a zdedupuje dávku surových záznamů z OFF. */
export function importFoods(raws: RawFood[]): NormalizedFood[] {
  const accepted: NormalizedFood[] = [];
  for (const raw of raws) {
    const res = normalizeFood(raw);
    if (res.status === 'accepted') accepted.push(res.food);
  }
  return dedupeByBarcode(accepted);
}
