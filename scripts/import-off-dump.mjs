#!/usr/bin/env node
/**
 * import:off:dump – hromadný import potravin z oficiálního Open Food Facts
 * data dumpu (JSONL, gzip). Na rozdíl od import-off.mjs (search API, ~stovky
 * položek) tohle škáluje na tisíce až desetitisíce produktů z CZ/SK.
 *
 * Stream čte řádek po řádku (gunzip), takže nezáleží na velikosti souboru –
 * do paměti se drží jen malá dávka. Filtruje na zvolené země, prožene názvy
 * filtrem kvality (scripts/lib/food-quality.mjs), validuje pravidly F-03
 * (packages/off-import) a upsertuje do `foods` se source='off'.
 *
 * Zdroj dumpu (oficiální, ODbL):
 *   https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
 *
 * Spuštění (stream přímo z URL, bez ukládání celého souboru):
 *   node scripts/import-off-dump.mjs
 * Nebo z lokálně staženého souboru:
 *   node scripts/import-off-dump.mjs --file=./openfoodfacts-products.jsonl.gz
 * Volby: --limit=20000  --countries=en:czech-republic,en:slovakia  --batch=200
 *
 * DB se bere z .env (SUPABASE_DB_URL / SUPABASE_DB_PASSWORD).
 */
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import pg from 'pg';

import { normalizeFood } from '../packages/off-import/dist/index.js';
import { pickName, isReasonableName } from './lib/food-quality.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUMP_URL = 'https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz';
const USER_AGENT = 'dietapp/0.1 (jan.harak@tesena.com) - jednorazovy import OFF dump';

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
const FILE = arg('file', null);
const LIMIT = Number(arg('limit', String(Infinity)));
const BATCH = Number(arg('batch', '200'));
const COUNTRIES = new Set(
  arg('countries', 'en:czech-republic,en:slovakia').split(',').map((c) => c.trim()).filter(Boolean),
);

const url = env.SUPABASE_DB_URL;
if (!url) {
  console.error('Chybí SUPABASE_DB_URL v .env (Connect → Session pooler URI).');
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

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function toRaw(p) {
  const n = p.nutriments ?? {};
  return {
    name: pickName(p),
    barcode: p.code ?? null,
    brand: Array.isArray(p.brands) ? p.brands.join(', ') || null : (p.brands || null),
    external_id: p.code ?? null,
    kcal_100g: num(n['energy-kcal_100g']),
    protein_100g: num(n.proteins_100g),
    carbs_100g: num(n.carbohydrates_100g),
    fat_100g: num(n.fat_100g),
    fiber_100g: num(n.fiber_100g),
    sugar_100g: num(n.sugars_100g),
    salt_100g: num(n.salt_100g),
  };
}

function inTargetCountry(p) {
  const tags = p.countries_tags;
  if (Array.isArray(tags)) return tags.some((t) => COUNTRIES.has(t));
  return false;
}

async function upsertBatch(client, foods) {
  const cols = [
    'source', 'external_id', 'barcode', 'name', 'brand',
    'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g',
    'fiber_100g', 'sugar_100g', 'salt_100g', 'is_verified',
  ];
  const values = [];
  const rowsSql = foods.map((f, i) => {
    const base = i * cols.length;
    values.push(
      'off', f.externalId, f.barcode, f.name, f.brand,
      f.kcal_100g, f.protein_100g, f.carbs_100g, f.fat_100g,
      f.fiber_100g, f.sugar_100g, f.salt_100g, false,
    );
    return `(${cols.map((_, j) => `$${base + j + 1}`).join(',')})`;
  });
  const sql = `
    insert into foods (${cols.join(',')})
    values ${rowsSql.join(',')}
    on conflict (barcode) where source = 'off' and barcode is not null
    do update set
      name = excluded.name, brand = excluded.brand,
      kcal_100g = excluded.kcal_100g, protein_100g = excluded.protein_100g,
      carbs_100g = excluded.carbs_100g, fat_100g = excluded.fat_100g,
      fiber_100g = excluded.fiber_100g, sugar_100g = excluded.sugar_100g,
      salt_100g = excluded.salt_100g, external_id = excluded.external_id`;
  await client.query(sql, values);
}

async function getLineStream() {
  if (FILE) {
    const path = FILE;
    if (!existsSync(path)) throw new Error(`Soubor nenalezen: ${path}`);
    const raw = createReadStream(path);
    const input = path.endsWith('.gz') ? raw.pipe(createGunzip()) : raw;
    return createInterface({ input, crlfDelay: Infinity });
  }
  console.log(`Stahuji a streamuji dump z ${DUMP_URL} ...`);
  const res = await fetch(DUMP_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`Dump HTTP ${res.status}`);
  const input = Readable.fromWeb(res.body).pipe(createGunzip());
  return createInterface({ input, crlfDelay: Infinity });
}

async function main() {
  console.log(`Import OFF dump: země=${[...COUNTRIES].join(', ')}, limit=${LIMIT}, dávka=${BATCH}`);
  const client = new pg.Client(connectionConfig());
  await client.connect();

  const seen = new Set();
  let scanned = 0, matched = 0, accepted = 0, written = 0, droppedName = 0, droppedValid = 0;
  let batch = [];
  const rl = await getLineStream();

  try {
    for await (const line of rl) {
      if (!line) continue;
      scanned += 1;
      if (scanned % 200000 === 0) {
        process.stdout.write(`  proskenováno ${scanned}, CZ/SK ${matched}, přijato ${accepted}, zapsáno ${written}\r`);
      }
      let p;
      try { p = JSON.parse(line); } catch { continue; }
      if (!inTargetCountry(p)) continue;
      matched += 1;

      const raw = toRaw(p);
      if (!isReasonableName(raw.name)) { droppedName += 1; continue; }
      const res = normalizeFood(raw);
      if (res.status !== 'accepted') { droppedValid += 1; continue; }
      const f = res.food;
      if (f.barcode) {
        if (seen.has(f.barcode)) continue;
        seen.add(f.barcode);
      }
      accepted += 1;
      batch.push(f);
      if (batch.length >= BATCH) {
        await upsertBatch(client, batch);
        written += batch.length;
        batch = [];
      }
      if (accepted >= LIMIT) break;
    }
    if (batch.length) {
      await upsertBatch(client, batch);
      written += batch.length;
    }
    process.stdout.write('\n');

    const { rows } = await client.query("select count(*)::int n from foods where source = 'off'");
    console.log(`\nHotovo.`);
    console.log(`  Proskenováno řádků: ${scanned}`);
    console.log(`  Odpovídá CZ/SK: ${matched}`);
    console.log(`  Zahozeno (název): ${droppedName}, (validace F-03): ${droppedValid}`);
    console.log(`  Přijato a zapsáno: ${written}`);
    console.log(`  OFF potravin v DB celkem: ${rows[0].n}`);
    console.log('Atribuce: Data o potravinách © Open Food Facts contributors, licence ODbL.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('Import dumpu selhal:', e.message);
  process.exit(1);
});
