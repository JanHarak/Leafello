#!/usr/bin/env node
/**
 * import:off – naplní tabulku `foods` daty z Open Food Facts (F-03).
 *
 * Stáhne nejpopulárnější produkty pro zvolené země (výchozí CZ + SK) z
 * vyhledávacího API OFF, proežene je závaznými validačními pravidly z
 * balíčku @dietapp/off-import (F-03) a upsertne do `foods` se source='off'.
 * Jde o jednorázové naplnění vlastní tabulky; aplikace za běhu OFF API
 * nedotazuje (viz zadání F-03). Atribuce ODbL je v aplikaci povinná.
 *
 * Spuštění:  node scripts/import-off.mjs [--limit=800] [--per-country=]
 *            [--countries=en:czech-republic,en:slovakia]
 * DB se bere z .env (SUPABASE_DB_URL / SUPABASE_DB_PASSWORD), stejně jako
 * u db:push.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { importFoods } from '../packages/off-import/dist/index.js';
import { pickName, isReasonableName } from './lib/food-quality.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const USER_AGENT = 'dietapp/0.1 (jan.harak@tesena.com) - jednorazovy import OFF';
const FIELDS = 'code,product_name,brands,nutriments';
const PAGE_SIZE = 100;

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
const LIMIT = Number(arg('limit', '800'));
const COUNTRIES = arg('countries', 'en:czech-republic,en:slovakia')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);
const PER_COUNTRY = Number(arg('per-country', String(Math.ceil(LIMIT / COUNTRIES.length))));

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
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    database: u.pathname.slice(1) || 'postgres',
    password: env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Název se vybírá sdílenou logikou (cs → sk → en → obecný). */
function nameOf(p) {
  return pickName(p);
}
function brandOf(p) {
  if (Array.isArray(p.brands)) return p.brands.join(', ') || null;
  if (typeof p.brands === 'string') return p.brands || null;
  return null;
}

/** Namapuje produkt OFF na RawFood pro validaci (F-03). */
function toRaw(p) {
  const n = p.nutriments ?? {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    name: nameOf(p),
    barcode: p.code ?? null,
    brand: brandOf(p),
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

async function fetchCountry(country, target) {
  const raws = [];
  const q = encodeURIComponent(`countries_tags:"${country}"`);
  let page = 1;
  while (raws.length < target) {
    const u = `${SEARCH_URL}?q=${q}&sort_by=-unique_scans_n&page=${page}&page_size=${PAGE_SIZE}&fields=${FIELDS}`;
    const res = await fetch(u, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      console.warn(`  ${country} strana ${page}: HTTP ${res.status}, končím zemi`);
      break;
    }
    const json = await res.json();
    const hits = json.hits ?? [];
    if (hits.length === 0) break;
    for (const p of hits) {
      const raw = toRaw(p);
      if (!isReasonableName(raw.name)) continue; // filtr kvality (emoji, cizojazyčné, útržky)
      raws.push(raw);
    }
    process.stdout.write(`  ${country}: staženo ${raws.length}\r`);
    page += 1;
    await sleep(400); // ohleduplné tempo k veřejnému API
  }
  process.stdout.write('\n');
  return raws.slice(0, target);
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
    const ph = cols.map((_, j) => `$${base + j + 1}`);
    return `(${ph.join(',')})`;
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

async function main() {
  console.log(`Import OFF: země=${COUNTRIES.join(', ')}, cíl ~${LIMIT} (max ${PER_COUNTRY}/zemi).`);
  let allRaw = [];
  for (const country of COUNTRIES) {
    const raws = await fetchCountry(country, PER_COUNTRY);
    allRaw = allRaw.concat(raws);
  }
  console.log(`Staženo surových záznamů: ${allRaw.length}`);

  const foods = importFoods(allRaw); // validace F-03 + dedup podle barcode
  console.log(`Po validaci a deduplikaci: ${foods.length} (zahozeno ${allRaw.length - foods.length}).`);
  if (foods.length === 0) {
    console.log('Nic k importu.');
    return;
  }

  const client = new pg.Client(connectionConfig());
  await client.connect();
  try {
    const BATCH = 100;
    let done = 0;
    for (let i = 0; i < foods.length; i += BATCH) {
      const batch = foods.slice(i, i + BATCH);
      await upsertBatch(client, batch);
      done += batch.length;
      process.stdout.write(`  zapsáno ${done}/${foods.length}\r`);
    }
    process.stdout.write('\n');
    const { rows } = await client.query("select count(*)::int as n from foods where source = 'off'");
    console.log(`Hotovo. V tabulce foods je nyní ${rows[0].n} OFF potravin.`);
    console.log('Atribuce: Data o potravinách © Open Food Facts contributors, licence ODbL.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('Import selhal:', e.message);
  process.exit(1);
});
