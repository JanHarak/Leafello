#!/usr/bin/env node
/**
 * import:nutridb – import generických českých potravin z oficiálního exportu
 * NutriDatabáze.cz (ÚZEI) do tabulky `foods` se source='nidb',
 * is_verified=true.
 *
 * Vstup je CSV export z registrovaného účtu NutriDatabaze.cz (středníkem
 * oddělený, kódování Windows-1250, hodnoty na 100 g jedlého podílu, desetinná
 * tečka). Data se používají v souladu s licencí NutriDatabaze.cz – atribuce je
 * v aplikaci povinná (patička).
 *
 * NutriDatabáze je důvěryhodný zdroj, proto se NEuplatňuje přísná Atwaterova
 * kontrola (jinak by vypadla vlákninou bohatá zelenina) – jen rozsahy hodnot.
 *
 * Spuštění:
 *   node scripts/import-nutridb.mjs --file=./data/NutriDatabaze-v11.26-data-export.csv
 * Volby: --limit=  --batch=200
 *
 * DB se bere z .env (SUPABASE_DB_URL / SUPABASE_DB_PASSWORD).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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
const FILE = arg('file', join(ROOT, 'data', 'NutriDatabaze-v11.26-data-export.csv'));
const LIMIT = Number(arg('limit', String(Infinity)));
const BATCH = Number(arg('batch', '200'));

const url = env.SUPABASE_DB_URL;
if (!url) { console.error('Chybí SUPABASE_DB_URL v .env.'); process.exit(1); }
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

const inRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
function num(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function parseCsv(path) {
  if (!existsSync(path)) { console.error(`Soubor nenalezen: ${path}`); process.exit(1); }
  const buf = readFileSync(path);
  const text = new TextDecoder('windows-1250').decode(buf); // český export je v cp1250
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split(';').map((h) => h.trim());
  const col = (name) => header.indexOf(name);
  const idx = {
    code: col('OrigFdCd'), name: col('OrigFdNm'),
    kcal: col('ENERC [kcal]'), fat: col('FAT [g]'),
    cho: col('CHO [g]'), chot: col('CHOT [g]'), sugar: col('SUGAR [g]'),
    fiber: col('FIBT [g]'), prot: col('PROT [g]'),
    nacl: col('NACL [g]'), na: col('NA [mg]'),
  };
  for (const [k, v] of Object.entries(idx)) {
    if (v < 0 && ['code', 'name', 'kcal', 'fat', 'prot'].includes(k)) {
      console.error(`V hlavičce chybí sloupec pro '${k}'. Hlavička: ${header.join(' | ')}`);
      process.exit(1);
    }
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(';').map((x) => x.trim());
    rows.push(f);
  }
  return { idx, rows };
}

function toRow(f, idx) {
  const name = (f[idx.name] || '').trim();
  if (!name) return null;
  const kcal = num(f[idx.kcal]);
  if (!inRange(kcal, 0, 900)) return null;
  const protein = num(f[idx.prot]) ?? 0;
  // sacharidy: dostupné (CHO, bez vlákniny) jako na EU etiketě; fallback CHOT
  const carbs = num(f[idx.cho]) ?? num(f[idx.chot]) ?? 0;
  const fat = num(f[idx.fat]) ?? 0;
  if (![protein, carbs, fat].every((x) => inRange(x, 0, 100))) return null;
  if (protein + carbs + fat > 105) return null;
  const naclDirect = idx.nacl >= 0 ? num(f[idx.nacl]) : null;
  const naMg = idx.na >= 0 ? num(f[idx.na]) : null;
  const salt = naclDirect != null ? naclDirect
    : (naMg != null ? Math.round((naMg * 2.5) / 1000 * 100) / 100 : null);
  return {
    code: (f[idx.code] || '').trim(),
    name: name.slice(0, 200),
    kcal, protein, carbs, fat,
    fiber: idx.fiber >= 0 ? num(f[idx.fiber]) : null,
    sugar: idx.sugar >= 0 ? num(f[idx.sugar]) : null,
    salt,
  };
}

async function upsertBatch(client, rows) {
  const cols = ['source', 'external_id', 'name', 'kcal_100g', 'protein_100g', 'carbs_100g',
    'fat_100g', 'fiber_100g', 'sugar_100g', 'salt_100g', 'is_verified'];
  const values = [];
  const rowsSql = rows.map((r, i) => {
    const base = i * cols.length;
    values.push('nidb', `nidb-${r.code}`, r.name, r.kcal, r.protein, r.carbs, r.fat, r.fiber, r.sugar, r.salt, true);
    return `(${cols.map((_, j) => `$${base + j + 1}`).join(',')})`;
  });
  const sql = `
    insert into foods (${cols.join(',')})
    values ${rowsSql.join(',')}
    on conflict (external_id) where source = 'nidb' and external_id is not null
    do update set
      name = excluded.name, kcal_100g = excluded.kcal_100g,
      protein_100g = excluded.protein_100g, carbs_100g = excluded.carbs_100g,
      fat_100g = excluded.fat_100g, fiber_100g = excluded.fiber_100g,
      sugar_100g = excluded.sugar_100g, salt_100g = excluded.salt_100g, is_verified = true`;
  await client.query(sql, values);
}

async function main() {
  console.log(`Načítám NutriDatabáze CSV: ${FILE}`);
  const { idx, rows } = parseCsv(FILE);
  console.log(`Řádků v souboru: ${rows.length}`);

  const out = [];
  let dropped = 0;
  const seen = new Set();
  for (const f of rows) {
    const r = toRow(f, idx);
    if (!r || !r.code) { dropped += 1; continue; }
    if (seen.has(r.code)) continue;
    seen.add(r.code);
    out.push(r);
    if (out.length >= LIMIT) break;
  }
  console.log(`Použitelných: ${out.length}, zahozeno: ${dropped}`);
  if (out.length === 0) { console.log('Nic k importu.'); return; }

  const client = new pg.Client(connectionConfig());
  await client.connect();
  try {
    let written = 0;
    for (let i = 0; i < out.length; i += BATCH) {
      await upsertBatch(client, out.slice(i, i + BATCH));
      written += Math.min(BATCH, out.length - i);
      process.stdout.write(`  zapsáno ${written}/${out.length}\r`);
    }
    process.stdout.write('\n');
    const { rows: cnt } = await client.query("select count(*)::int n from foods where source = 'nidb'");
    console.log(`\nHotovo. NutriDatabáze potravin v DB: ${cnt[0].n}.`);
    console.log('Atribuce (povinná): Zdroj dat NutriDatabaze.cz – Databáze složení potravin ČR, ÚZEI.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('NutriDatabáze import selhal:', e.message);
  process.exit(1);
});
