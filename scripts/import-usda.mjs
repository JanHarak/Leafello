#!/usr/bin/env node
/**
 * import:usda – import generických potravin z USDA FoodData Central
 * (public domain) do tabulky `foods` se source='usda', is_verified=true.
 *
 * Vstup je oficiální JSON export FDC (SR Legacy nebo Foundation Foods), ke
 * stažení zdarma z https://fdc.nal.usda.gov/download-datasets. Hodnoty jsou
 * na 100 g. Názvy se dávkově přeloží do češtiny (scripts/lib/translate-cs.mjs,
 * Gemini – GEMINI_API_KEY v .env; bez klíče zůstanou anglicky).
 *
 * USDA je důvěryhodný zdroj, proto se NEuplatňuje přísná Atwaterova kontrola
 * z F-03 (ta zahazuje např. vlákninou bohatou zeleninu) – jen rozsahy hodnot.
 *
 * Spuštění:
 *   node scripts/import-usda.mjs --file=./FoodData_Central_sr_legacy_food_json_2018-04.json
 * Volby: --limit=  --batch=200
 *
 * DB se bere z .env (SUPABASE_DB_URL / SUPABASE_DB_PASSWORD).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { translateNames } from './lib/translate-cs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const env = { ...loadEnv(), ...process.env };
// zpřístupni GEMINI_* překladači (ten čte z process.env)
for (const k of ['GEMINI_API_KEY', 'GEMINI_MODEL']) if (env[k] && !process.env[k]) process.env[k] = env[k];

const FILE = arg('file', null);
const LIMIT = Number(arg('limit', String(Infinity)));
const BATCH = Number(arg('batch', '200'));

if (!FILE) {
  console.error('Chybí --file=<USDA JSON> (stáhni z https://fdc.nal.usda.gov/download-datasets).');
  process.exit(1);
}
const url = env.SUPABASE_DB_URL;
if (!url) {
  console.error('Chybí SUPABASE_DB_URL v .env.');
  process.exit(1);
}
function connectionConfig() {
  const base = { connectionString: url, ssl: { rejectUnauthorized: false } };
  if (!env.SUPABASE_DB_PASSWORD) return base;
  const u = new URL(url);
  return {
    host: u.hostname, port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username), database: u.pathname.slice(1) || 'postgres',
    password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
  };
}

/** Najde pole potravin v FDC JSON (SR Legacy / Foundation / obecné). */
function findFoods(root) {
  if (Array.isArray(root)) return root;
  return root.SRLegacyFoods || root.FoundationFoods || root.foods ||
    Object.values(root).find((v) => Array.isArray(v)) || [];
}

/** Mapa hodnot podle čísla nutrientu (USDA "nutrient number"). */
function nutrientMap(food) {
  const m = {};
  for (const fn of food.foodNutrients ?? []) {
    const num = fn?.nutrient?.number ?? fn?.nutrientNumber;
    const amount = typeof fn?.amount === 'number' ? fn.amount : (typeof fn?.value === 'number' ? fn.value : null);
    if (num != null && amount != null) m[String(num)] = amount;
  }
  return m;
}

const inRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function toRow(food) {
  const desc = typeof food.description === 'string' ? food.description.trim() : '';
  if (!desc) return null;
  const n = nutrientMap(food);
  const kcal = n['208'] ?? n['957'] ?? n['958']; // Energy (kcal), fallback Atwater factors
  if (!inRange(kcal, 0, 900)) return null;
  const protein = n['203'] ?? 0;
  const carbs = n['205'] ?? 0;
  const fat = n['204'] ?? 0;
  if (![protein, carbs, fat].every((x) => inRange(x, 0, 100))) return null;
  if (protein + carbs + fat > 105) return null;
  const sodiumMg = n['307'];
  return {
    fdcId: food.fdcId,
    descEn: desc.slice(0, 200),
    kcal, protein, carbs, fat,
    fiber: typeof n['291'] === 'number' ? n['291'] : null,
    sugar: typeof n['269'] === 'number' ? n['269'] : null,
    salt: typeof sodiumMg === 'number' ? Math.round((sodiumMg * 2.5) / 1000 * 100) / 100 : null,
  };
}

async function upsertBatch(client, rows) {
  const cols = ['source', 'external_id', 'name', 'kcal_100g', 'protein_100g', 'carbs_100g',
    'fat_100g', 'fiber_100g', 'sugar_100g', 'salt_100g', 'is_verified'];
  const values = [];
  const rowsSql = rows.map((r, i) => {
    const base = i * cols.length;
    values.push('usda', `usda-${r.fdcId}`, r.name, r.kcal, r.protein, r.carbs, r.fat, r.fiber, r.sugar, r.salt, true);
    return `(${cols.map((_, j) => `$${base + j + 1}`).join(',')})`;
  });
  const sql = `
    insert into foods (${cols.join(',')})
    values ${rowsSql.join(',')}
    on conflict (external_id) where source = 'usda' and external_id is not null
    do update set
      name = excluded.name, kcal_100g = excluded.kcal_100g,
      protein_100g = excluded.protein_100g, carbs_100g = excluded.carbs_100g,
      fat_100g = excluded.fat_100g, fiber_100g = excluded.fiber_100g,
      sugar_100g = excluded.sugar_100g, salt_100g = excluded.salt_100g, is_verified = true`;
  await client.query(sql, values);
}

async function main() {
  if (!existsSync(FILE)) { console.error(`Soubor nenalezen: ${FILE}`); process.exit(1); }
  console.log(`Načítám USDA JSON: ${FILE}`);
  const root = JSON.parse(readFileSync(FILE, 'utf8'));
  const foods = findFoods(root);
  console.log(`Potravin v souboru: ${foods.length}`);

  let rows = [];
  let dropped = 0;
  for (const f of foods) {
    const r = toRow(f);
    if (!r) { dropped += 1; continue; }
    rows.push(r);
    if (rows.length >= LIMIT) break;
  }
  console.log(`Použitelných (v rozsazích): ${rows.length}, zahozeno: ${dropped}`);
  if (rows.length === 0) { console.log('Nic k importu.'); return; }

  // překlad názvů do češtiny (s cache)
  const cs = await translateNames(rows.map((r) => r.descEn), (m) => console.log('  ' + m));
  rows.forEach((r, i) => { r.name = (cs[i] || r.descEn).slice(0, 200); });

  const client = new pg.Client(connectionConfig());
  await client.connect();
  try {
    let written = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      await upsertBatch(client, rows.slice(i, i + BATCH));
      written += Math.min(BATCH, rows.length - i);
      process.stdout.write(`  zapsáno ${written}/${rows.length}\r`);
    }
    process.stdout.write('\n');
    const { rows: cnt } = await client.query("select count(*)::int n from foods where source = 'usda'");
    console.log(`\nHotovo. USDA potravin v DB: ${cnt[0].n}.`);
    console.log('Zdroj: USDA FoodData Central (public domain).');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('USDA import selhal:', e.message);
  process.exit(1);
});
