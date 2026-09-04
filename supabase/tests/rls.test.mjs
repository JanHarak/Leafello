/**
 * RLS testy T-41 až T-47 (zadání 7.5).
 *
 * Ověřují izolaci dat mezi uživateli přímo v databázi: založí dva uživatele
 * A a B, jako postgres vloží data patřící B, a pak simuluje přihlášení
 * jednotlivých uživatelů nastavením `request.jwt.claims` + role `authenticated`.
 * Postgres je vlastník tabulek, takže RLS obchází a slouží jen k přípravě
 * fixtures; vlastní kontroly běží pod rolí `authenticated`, na kterou RLS platí.
 *
 * Spuštění: `npm run test:rls` (potřebuje vyplněné .env se SUPABASE_DB_URL,
 * volitelně SUPABASE_DB_PASSWORD).
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
const url = env.SUPABASE_DB_URL;
if (!url) {
  console.error('Chybí SUPABASE_DB_URL v .env.');
  process.exit(2);
}
function config() {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    database: u.pathname.slice(1) || 'postgres',
    password: env.SUPABASE_DB_PASSWORD || decodeURIComponent(u.password),
    ssl: { rejectUnauthorized: false },
  };
}

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const OFF_FOOD = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B_RECIPE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const client = new pg.Client(config());

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

/** Spustí callback pod rolí authenticated se simulovaným přihlášením uid. */
async function asUser(uid, fn) {
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: 'authenticated' }),
    ]);
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

async function expectRejected(uid, sql, params = []) {
  try {
    await asUser(uid, () => client.query(sql, params));
    return false; // neprošlo = odmítnutí neproběhlo
  } catch {
    return true; // vyhozená chyba = odmítnuto (RLS/policy)
  }
}

async function seed() {
  // Úklid případných zbytků z minula (cascade smaže i data).
  await client.query('delete from auth.users where id = any($1::uuid[])', [[A, B]]);
  await client.query('delete from foods where id = $1', [OFF_FOOD]);

  for (const id of [A, B]) {
    await client.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), now())`,
      [id, `${id}@example.test`],
    );
  }

  // Veřejná OFF potravina (čitelná všem) – kvůli referenci z deníku.
  await client.query(
    `insert into foods (id, source, name, kcal_100g) values ($1, 'off', 'Testovací potravina', 100)`,
    [OFF_FOOD],
  );

  // Data patřící uživateli B.
  await client.query(
    `insert into diary_entries (user_id, meal, food_id, grams, snapshot)
     values ($1, 'breakfast', $2, 100, '{"kcal":100}'::jsonb)`,
    [B, OFF_FOOD],
  );
  await client.query(
    `insert into weight_logs (user_id, weight_kg) values ($1, 80)`,
    [B],
  );
  await client.query(
    `insert into recipes (id, owner_id, name, servings, is_public) values ($1, $2, 'Tajný recept B', 2, false)`,
    [B_RECIPE, B],
  );
  // Fotku do storage.objects nevkládáme tady – Supabase blokuje přímé mazání,
  // takže test T-46 běží ve vlastní transakci s rollbackem (viz níže).
}

async function cleanup() {
  await client.query('delete from auth.users where id = any($1::uuid[])', [[A, B]]);
  await client.query('delete from foods where id = $1', [OFF_FOOD]);
}

async function main() {
  await client.connect();
  try {
    await seed();

    // T-41: A čte diary_entries B → 0 řádků
    const t41 = await asUser(A, () => client.query('select count(*)::int c from diary_entries'));
    check('T-41', t41.rows[0].c === 0, `viditelných řádků: ${t41.rows[0].c}`);

    // T-42: A vloží diary_entries s user_id = B → odmítnuto
    const t42 = await expectRejected(
      A,
      `insert into diary_entries (user_id, meal, food_id, grams, snapshot)
       values ($1, 'lunch', $2, 50, '{"kcal":50}'::jsonb)`,
      [B, OFF_FOOD],
    );
    check('T-42', t42, 'vložení cizího user_id odmítnuto');

    // T-43: A čte weight_logs B → 0 řádků
    const t43 = await asUser(A, () => client.query('select count(*)::int c from weight_logs'));
    check('T-43', t43.rows[0].c === 0, `viditelných řádků: ${t43.rows[0].c}`);

    // T-44: A zapíše do foods se source='off' → odmítnuto
    const t44 = await expectRejected(
      A,
      `insert into foods (source, name, kcal_100g, created_by) values ('off', 'Podvržená', 100, $1)`,
      [A],
    );
    check('T-44', t44, 'zápis foods se source=off odmítnut');

    // T-45: A čte cizí neveřejný recept → 0 řádků
    const t45 = await asUser(A, () =>
      client.query('select count(*)::int c from recipes where id = $1', [B_RECIPE]),
    );
    check('T-45', t45.rows[0].c === 0, `viditelných řádků: ${t45.rows[0].c}`);

    // T-46: A vidí fotku z cesty {B}/x.jpg → 0 řádků (nemůže stáhnout).
    // Vloží se v téže transakci jako postgres a hned se rollbackuje, protože
    // Supabase nepovoluje přímé mazání z storage.objects.
    await client.query('begin');
    try {
      await client.query("insert into storage.objects (bucket_id, name) values ('meal-photos', $1)", [`${B}/x.jpg`]);
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: A, role: 'authenticated' }),
      ]);
      const t46 = await client.query("select count(*)::int c from storage.objects where name = $1", [`${B}/x.jpg`]);
      check('T-46', t46.rows[0].c === 0, `viditelných objektů: ${t46.rows[0].c}`);
    } finally {
      await client.query('rollback');
    }

    // Kontrola: B svá vlastní data vidí (RLS nesmí blokovat vlastníka)
    const bSees = await asUser(B, () => client.query('select count(*)::int c from diary_entries'));
    check('B vidí svá data', bSees.rows[0].c === 1, `řádků: ${bSees.rows[0].c}`);

    // T-47: žádná tabulka v public bez RLS
    const t47 = await client.query(
      "select count(*)::int c from pg_tables where schemaname='public' and rowsecurity=false",
    );
    check('T-47', t47.rows[0].c === 0, `tabulek bez RLS: ${t47.rows[0].c}`);
  } finally {
    try {
      await cleanup();
    } catch (e) {
      console.log('  (úklid fixtures selhal, nevadí pro výsledek):', e.message);
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
