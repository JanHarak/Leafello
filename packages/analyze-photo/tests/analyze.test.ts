/**
 * Kontraktní testy Edge Function analyze-photo (zadání 7.6, T-48 až T-56).
 *
 * Testuje se čistá rozhodovací logika s injektovaným (mockovaným) voláním
 * Gemini, bez reálného API klíče a bez Deno runtime. Fotoanalýza se nikdy
 * neukládá do deníku – funkce jen vrací návrh k potvrzení uživatelem.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DAILY_LIMIT,
  MAX_ATTEMPTS,
  analyzePhoto,
  ownsPath,
  parseGeminiResponse,
  sanitizeItems,
} from '../src';

const noSleep = async () => {};

function validBody(items = 2) {
  return JSON.stringify({
    items: Array.from({ length: items }, (_, i) => ({
      name: `Položka ${i + 1}`,
      estimated_grams: 100,
      confidence: 0.8,
      kcal_100g: 200,
      protein_100g: 10,
      carbs_100g: 20,
      fat_100g: 5,
    })),
    not_food: false,
    notes: '',
  });
}

function input(overrides = {}) {
  return {
    storagePath: 'user-1/photo.jpg',
    userId: 'user-1',
    hasJwt: true,
    usedToday: 0,
    limit: DEFAULT_DAILY_LIMIT,
    ...overrides,
  };
}

describe('parsování odpovědi Gemini', () => {
  it('T-49: JSON obalený v ```json fence se naparsuje', () => {
    const fenced = '```json\n' + validBody(1) + '\n```';
    const res = parseGeminiResponse(fenced);
    expect(res.ok).toBe(true);
  });

  it('T-50: nevalidní JSON → ok:false', () => {
    expect(parseGeminiResponse('tohle není json').ok).toBe(false);
  });

  it('holý JSON bez fence projde', () => {
    expect(parseGeminiResponse(validBody(2)).ok).toBe(true);
  });
});

describe('filtrování položek', () => {
  it('T-56: položky s estimated_grams 0 nebo záporné se odfiltrují', () => {
    const items = [
      { name: 'A', estimated_grams: 120 },
      { name: 'B', estimated_grams: 0 },
      { name: 'C', estimated_grams: -5 },
    ];
    expect(sanitizeItems(items).map((i) => i.name)).toEqual(['A']);
  });
});

describe('autorizace cesty', () => {
  it('T-53: cesta jiného uživatele → false', () => {
    expect(ownsPath('user-2/x.jpg', 'user-1')).toBe(false);
  });
  it('vlastní cesta → true', () => {
    expect(ownsPath('user-1/x.jpg', 'user-1')).toBe(true);
  });
});

describe('analyzePhoto – celý průběh', () => {
  it('T-48: validní JSON se 2 položkami → done, 2 položky, nic neuloženo', async () => {
    let saved = false;
    const res = await analyzePhoto(input(), {
      callGemini: async () => ({ status: 200, text: validBody(2) }),
      saveToDiary: async () => {
        saved = true;
      },
      sleep: noSleep,
    });
    expect(res.httpStatus).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.items).toHaveLength(2);
    expect(saved).toBe(false);
  });

  it('T-50: nevalidní JSON → status failed, čitelná zpráva, žádná výjimka', async () => {
    const res = await analyzePhoto(input(), {
      callGemini: async () => ({ status: 200, text: 'rozbité' }),
      sleep: noSleep,
    });
    expect(res.httpStatus).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(typeof res.body.message).toBe('string');
  });

  it('T-51: not_food=true → zpráva a prázdný seznam položek', async () => {
    const res = await analyzePhoto(input(), {
      callGemini: async () => ({
        status: 200,
        text: JSON.stringify({ items: [], not_food: true, notes: '' }),
      }),
      sleep: noSleep,
    });
    expect(res.body.not_food).toBe(true);
    expect(res.body.items).toEqual([]);
    expect(res.body.message).toBeTruthy();
  });

  it('T-52: 11. analýza při limitu 10 → 429', async () => {
    const res = await analyzePhoto(input({ usedToday: 10, limit: 10 }), {
      callGemini: async () => ({ status: 200, text: validBody(1) }),
      sleep: noSleep,
    });
    expect(res.httpStatus).toBe(429);
  });

  it('T-53: cesta patří jinému uživateli → 403', async () => {
    const res = await analyzePhoto(input({ storagePath: 'user-2/x.jpg' }), {
      callGemini: async () => ({ status: 200, text: validBody(1) }),
      sleep: noSleep,
    });
    expect(res.httpStatus).toBe(403);
  });

  it('T-54: bez JWT → 401', async () => {
    const res = await analyzePhoto(input({ hasJwt: false }), {
      callGemini: async () => ({ status: 200, text: validBody(1) }),
      sleep: noSleep,
    });
    expect(res.httpStatus).toBe(401);
  });

  it('T-55: Gemini vrací 429 → jeden retry, pak failed s uloženou raw odpovědí', async () => {
    let calls = 0;
    const res = await analyzePhoto(input(), {
      callGemini: async () => {
        calls += 1;
        return { status: 429, text: 'rate limited by gemini' };
      },
      sleep: noSleep,
    });
    expect(calls).toBe(MAX_ATTEMPTS); // původní pokus + jeden retry = 2
    expect(res.body.status).toBe('failed');
    expect(res.body.raw).toBe('rate limited by gemini');
  });

  it('T-56 (průběh): položky s nulovou gramáží se z výsledku odfiltrují', async () => {
    const body = JSON.stringify({
      items: [
        { name: 'Dobrá', estimated_grams: 100 },
        { name: 'Nula', estimated_grams: 0 },
      ],
      not_food: false,
      notes: '',
    });
    const res = await analyzePhoto(input(), {
      callGemini: async () => ({ status: 200, text: body }),
      sleep: noSleep,
    });
    expect(res.body.items.map((i) => i.name)).toEqual(['Dobrá']);
  });
});
