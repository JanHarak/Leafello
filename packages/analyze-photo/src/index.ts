/**
 * Rozhodovací logika Edge Function `analyze-photo`.
 *
 * Záměrně bez závislosti na Deno, síti nebo databázi: volání Gemini,
 * ukládání a spánek se injektují (`AnalyzeDeps`), takže logika je plně
 * testovatelná s mockem a stejný kód použije i Deno handler.
 *
 * Nepřekročitelné pravidlo: fotoanalýza se NIKDY neuloží do deníku
 * automaticky. Funkce vrací jen návrh k potvrzení uživatelem.
 */

export const DEFAULT_DAILY_LIMIT = 10;
export const MAX_ATTEMPTS = 2; // původní pokus + jeden retry na 429

export const NOT_FOOD_MESSAGE_KEY = 'photo.notFood';
export const FAILED_MESSAGE_KEY = 'photo.failed';
export const RATE_LIMIT_MESSAGE_KEY = 'photo.rateLimited';

export interface GeminiItem {
  name: string;
  estimated_grams: number;
  confidence?: number;
  kcal_100g?: number;
  protein_100g?: number;
  carbs_100g?: number;
  fat_100g?: number;
}

export interface GeminiPayload {
  items: GeminiItem[];
  not_food?: boolean;
  notes?: string;
}

export type ParseResult = { ok: true; data: GeminiPayload } | { ok: false };

/** Odstraní obalový ```json … ``` fence, pokud tam je. */
function stripFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

export function parseGeminiResponse(text: string): ParseResult {
  try {
    const data = JSON.parse(stripFence(text));
    if (typeof data !== 'object' || data === null || !Array.isArray(data.items)) {
      return { ok: false };
    }
    return { ok: true, data: data as GeminiPayload };
  } catch {
    return { ok: false };
  }
}

/** Odfiltruje položky s nekladnou odhadovanou gramáží. */
export function sanitizeItems<T extends { estimated_grams: number }>(items: T[]): T[] {
  return items.filter((item) => typeof item.estimated_grams === 'number' && item.estimated_grams > 0);
}

/** Cesta ve Storage musí začínat `{userId}/`. */
export function ownsPath(storagePath: string, userId: string): boolean {
  return storagePath.startsWith(`${userId}/`);
}

export interface AnalyzeInput {
  storagePath: string;
  userId: string;
  hasJwt: boolean;
  usedToday: number;
  limit: number;
}

export interface GeminiResponse {
  status: number;
  text: string;
}

export interface AnalyzeDeps {
  callGemini: () => Promise<GeminiResponse>;
  /** Nikdy se nevolá – existuje jen aby testy ověřily, že se do deníku neukládá. */
  saveToDiary?: (items: GeminiItem[]) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

export interface AnalyzeResult {
  httpStatus: number;
  body: {
    status?: 'done' | 'failed';
    items?: GeminiItem[];
    not_food?: boolean;
    notes?: string;
    message?: string;
    error?: string;
    raw?: string;
  };
}

// setTimeout existuje ve všech cílových runtime (Node, Deno, prohlížeč),
// ale není v lib ES2020; deklarujeme ho lokálně, ať modul nezávisí na DOM.
declare const setTimeout: (handler: () => void, ms: number) => unknown;
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(() => r(), ms));
const backoffMs = (attempt: number) => 2 ** attempt * 250;

export async function analyzePhoto(input: AnalyzeInput, deps: AnalyzeDeps): Promise<AnalyzeResult> {
  const sleep = deps.sleep ?? realSleep;

  if (!input.hasJwt) return { httpStatus: 401, body: { error: 'unauthorized' } };
  if (!ownsPath(input.storagePath, input.userId)) return { httpStatus: 403, body: { error: 'forbidden' } };
  if (input.usedToday >= input.limit) {
    return { httpStatus: 429, body: { error: 'rate_limited', message: RATE_LIMIT_MESSAGE_KEY } };
  }

  let lastText = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const resp = await deps.callGemini();
    lastText = resp.text;

    if (resp.status === 429) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { httpStatus: 200, body: { status: 'failed', message: FAILED_MESSAGE_KEY, raw: resp.text } };
    }

    if (resp.status !== 200) {
      return { httpStatus: 200, body: { status: 'failed', message: FAILED_MESSAGE_KEY, raw: resp.text } };
    }

    const parsed = parseGeminiResponse(resp.text);
    if (!parsed.ok) {
      return { httpStatus: 200, body: { status: 'failed', message: FAILED_MESSAGE_KEY, raw: resp.text } };
    }

    if (parsed.data.not_food === true) {
      return {
        httpStatus: 200,
        body: { status: 'done', not_food: true, items: [], notes: parsed.data.notes ?? '', message: NOT_FOOD_MESSAGE_KEY },
      };
    }

    return {
      httpStatus: 200,
      body: { status: 'done', not_food: false, items: sanitizeItems(parsed.data.items), notes: parsed.data.notes ?? '' },
    };
  }

  return { httpStatus: 200, body: { status: 'failed', message: FAILED_MESSAGE_KEY, raw: lastText } };
}
