/**
 * DB testy neměnnosti historie deníku (zadání 7.7):
 *  - T-58: změna kcal potraviny po zápisu nemění historický denní součet,
 *  - T-59: smazání potraviny (on delete set null) nechá záznam čitelný ze
 *    snapshotu.
 *
 * Denní součty čte pohled `v_daily_totals`, který sčítá `snapshot`, nikdy
 * aktuální `foods`. Spuštění: `npm run test:snapshot`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'package.json'));
const pg = require('pg');

function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadEnv(), ...process.env };
if (!env.SUPABASE_DB_URL) {
  console.error('Chybí SUPABASE_DB_URL v .env.');
  process.exit(2);
}
const u = new URL(env.SUPABASE_DB_URL);
const client = new pg.Client({
  host: u.hostname,
  port: u.port ? Number(u.port) : 5432,
  user: decodeURIComponent(u.username),
  database: u.pathname.slice(1) || 'postgres',
  password: env.SUPABASE_DB_PASSWORD || decodeURIComponent(u.password),
  ssl: { rejectUnauthorized: false },
});

const U = '33333333-3333-3333-3333-333333333333';
const FOOD = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

let pass = 0;
let fail = 0;
function check(id, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  OK  ${id}${detail ? '  ' + detail : ''}`);
  } else {
    fail += 1;
    console.log(`  XX  ${id}  ${detail}`);
  }
}

async function dailyKcal() {
  const r = await client.query(
    "select kcal from v_daily_totals where user_id = $1 and entry_date = current_date",
    [U],
  );
  return r.rows[0]?.kcal ?? null;
}

async function seed() {
  await client.query('delete from auth.users where id = $1', [U]);
  await client.query('delete from foods where id = $1', [FOOD]);
  await client.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), now())`,
    [U, `${U}@example.test`],
  );
  await client.query(
    `insert into foods (id, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g)
     values ($1, 'off', 'Snapshot potravina', 250, 10, 30, 8)`,
    [FOOD],
  );
  // Zápis 37 g → snapshot 92,5 kcal (viz T-57). Snapshot je zdroj pravdy.
  await client.query(
    `insert into diary_entries (user_id, meal, food_id, grams, snapshot)
     values ($1, 'lunch', $2, 37, $3::jsonb)`,
    [U, FOOD, JSON.stringify({ kcal: 92.5, protein: 3.7, carbs: 11.1, fat: 2.96 })],
  );
}

async function cleanup() {
  await client.query('delete from auth.users where id = $1', [U]);
  await client.query('delete from foods where id = $1', [FOOD]);
}

async function main() {
  await client.connect();
  try {
    await seed();

    // T-58: změna kcal potraviny po zápisu nemění historický součet
    const before = await dailyKcal();
    await client.query('update foods set kcal_100g = 500 where id = $1', [FOOD]);
    const after = await dailyKcal();
    check(
      'T-58',
      before !== null && String(before) === String(after),
      `denní kcal před ${before}, po změně potraviny ${after}`,
    );

    // T-59: smazání potraviny nechá záznam čitelný ze snapshotu
    await client.query('delete from foods where id = $1', [FOOD]);
    const row = await client.query(
      "select food_id, (snapshot->>'kcal') as kcal from diary_entries where user_id = $1",
      [U],
    );
    const r = row.rows[0];
    check(
      'T-59',
      !!r && r.food_id === null && r.kcal === '92.5',
      `food_id=${r?.food_id}, snapshot.kcal=${r?.kcal}`,
    );
  } finally {
    try {
      await cleanup();
    } catch (e) {
      console.log('  (úklid selhal, nevadí):', e.message);
    }
    await client.end();
  }
  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('Chyba běhu:', e.message);
  process.exit(1);
});
