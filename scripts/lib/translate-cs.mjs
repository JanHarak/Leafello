/**
 * Dávkový překlad názvů potravin z angličtiny do češtiny přes Gemini.
 *
 * Klíč a model se berou z prostředí (GEMINI_API_KEY, GEMINI_MODEL). Přeložené
 * názvy se cachují do `data/usda-name-cache.json`, takže opakovaný běh importu
 * už nepřekládá znovu (šetří volání i peníze). Bez klíče se vrátí originály
 * (import proběhne, jen s anglickými názvy) – volající na to upozorní.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_PATH = join(ROOT, 'data', 'usda-name-cache.json');
const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const BATCH = 40;

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function saveCache(cache) {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 0));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function translateBatch(names, key, model) {
  const list = names.map((n, i) => `${i + 1}. ${n}`).join('\n');
  const prompt =
    'Přelož následující názvy potravin z angličtiny do češtiny. Používej běžné ' +
    'české názvy potravin, stručně a přirozeně (např. "Chicken breast, raw" → ' +
    '"Kuřecí prsa, syrová"). Zachovej pořadí. Vrať pouze JSON objekt ' +
    '{"cs": ["...", "..."]} se stejným počtem položek.\n\n' + list;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: { cs: { type: 'array', items: { type: 'string' } } },
        required: ['cs'],
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = JSON.parse(text);
  const out = Array.isArray(parsed?.cs) ? parsed.cs : [];
  if (out.length !== names.length) throw new Error(`Gemini vrátil ${out.length} místo ${names.length}`);
  return out.map((s) => String(s).trim());
}

/**
 * Přeloží pole anglických názvů do češtiny. Vrací pole ve stejném pořadí.
 * @param {string[]} names
 * @param {(msg:string)=>void} [log]
 */
export async function translateNames(names, log = () => {}) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const cache = loadCache();

  if (!key) {
    log('GEMINI_API_KEY není nastavený – názvy zůstanou anglicky (přelož později).');
    return names.slice();
  }

  const todo = [...new Set(names.filter((n) => !(n in cache)))];
  log(`Překládám ${todo.length} nových názvů (z cache ${names.length - todo.length}) přes ${model}...`);

  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    try {
      const cs = await translateBatch(chunk, key, model);
      chunk.forEach((en, j) => { cache[en] = cs[j] || en; });
      saveCache(cache);
      log(`  přeloženo ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
    } catch (e) {
      log(`  dávka selhala (${e.message}) – ponechávám originály`);
      chunk.forEach((en) => { cache[en] = cache[en] || en; });
    }
    await sleep(300);
  }
  saveCache(cache);
  return names.map((n) => cache[n] || n);
}
