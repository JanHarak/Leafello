#!/usr/bin/env node
/**
 * seed:curated – naplní tabulku `foods` kurátorskými generickými potravinami
 * (české suroviny) z `data/curated-foods.cs.json`. Zdroj je 'curated',
 * is_verified=true (řadí se ve vyhledávání první). Idempotentní přes
 * external_id (slug): opakované spuštění existující položky aktualizuje,
 * nezdvojuje. Zároveň nahraje porce do `food_servings`.
 *
 * DB se bere z .env (SUPABASE_DB_URL / SUPABASE_DB_PASSWORD), stejně jako
 * u db:push. Skript jede přes přímé DB spojení (service role), obchází RLS.
 *
 * Spuštění:  node scripts/seed-curated-foods.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data', 'curated-foods.cs.json');

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

const env = { ...loadEnv(), ...process.env };
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

/** Ověří rozsahy (tvrdě) a Atwater (varování) – chytá překlepy v datech. */
function validate(f) {
  const errs = [];
  if (!f.slug || !/^[a-z0-9-]+$/.test(f.slug)) errs.push('slug');
  if (!f.name || typeof f.name !== 'string') errs.push('name');
  if (!(f.kcal >= 0 && f.kcal <= 900)) errs.push(`kcal=${f.kcal}`);
  for (const k of ['protein', 'carbs', 'fat']) {
    if (!(f[k] >= 0 && f[k] <= 100)) errs.push(`${k}=${f[k]}`);
  }
  if (f.protein + f.carbs + f.fat > 105) errs.push('makra>105');
  if (errs.length) return { ok: false, errs };
  let warn = null;
  if (f.kcal > 5) {
    const atwater = 4 * f.protein + 4 * f.carbs + 9 * f.fat;
    const diff = Math.abs(f.kcal - atwater) / f.kcal;
    if (diff > 0.25) warn = `Atwater: udáno ${f.kcal} kcal vs. dopočet ${atwater.toFixed(0)} (${(diff * 100).toFixed(0)} %)`;
  }
  return { ok: true, warn };
}

async function main() {
  const parsed = JSON.parse(readFileSync(DATA, 'utf8'));
  const foods = parsed.foods ?? [];
  console.log(`Načteno ${foods.length} kurátorských položek z ${DATA}`);

  // validace
  let bad = 0;
  for (const f of foods) {
    const v = validate(f);
    if (!v.ok) {
      bad += 1;
      console.error(`  CHYBA ${f.slug || '(bez slug)'}: ${v.errs.join(', ')}`);
    } else if (v.warn) {
      console.warn(`  ! ${f.slug}: ${v.warn}`);
    }
  }
  if (bad > 0) {
    console.error(`\n${bad} položek neprošlo validací. Oprav data a spusť znovu.`);
    process.exit(1);
  }

  const client = new pg.Client(connectionConfig());
  await client.connect();
  try {
    await client.query('begin');
    const idBySlug = new Map();
    for (const f of foods) {
      const { rows } = await client.query(
        `insert into foods
           (source, external_id, name, kcal_100g, protein_100g, carbs_100g, fat_100g,
            fiber_100g, sugar_100g, salt_100g, is_verified)
         values ('curated', $1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         on conflict (external_id) where source = 'curated' and external_id is not null
         do update set
           name = excluded.name, kcal_100g = excluded.kcal_100g,
           protein_100g = excluded.protein_100g, carbs_100g = excluded.carbs_100g,
           fat_100g = excluded.fat_100g, fiber_100g = excluded.fiber_100g,
           sugar_100g = excluded.sugar_100g, salt_100g = excluded.salt_100g,
           is_verified = true
         returning id`,
        [f.slug, f.name, f.kcal, f.protein, f.carbs, f.fat, f.fiber, f.sugar, f.salt],
      );
      idBySlug.set(f.slug, rows[0].id);
    }

    // porce: smaž a znovu vlož (kurátorské položky se plně re-derivují)
    const ids = [...idBySlug.values()];
    await client.query('delete from food_servings where food_id = any($1::uuid[])', [ids]);
    let servingCount = 0;
    for (const f of foods) {
      const id = idBySlug.get(f.slug);
      for (const s of f.servings ?? []) {
        await client.query(
          'insert into food_servings (food_id, label, grams, is_default) values ($1, $2, $3, $4)',
          [id, s.label, s.grams, !!s.default],
        );
        servingCount += 1;
      }
    }
    await client.query('commit');

    const { rows: cnt } = await client.query("select count(*)::int n from foods where source = 'curated'");
    console.log(`\nHotovo. Kurátorských potravin v DB: ${cnt[0].n}, porcí zapsáno: ${servingCount}.`);
    console.log('Zdroj hodnot: USDA FoodData Central (public domain) + údaje z obalů; české názvy vlastní.');
  } catch (e) {
    await client.query('rollback');
    console.error('Seed selhal (rollback):', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('Seed selhal:', e.message);
  process.exit(1);
});
