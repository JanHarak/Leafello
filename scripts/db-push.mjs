#!/usr/bin/env node
/**
 * db:push – aplikuje SQL migrace z `supabase/migrations/` na databázi
 * určenou v `.env` proměnnou `SUPABASE_DB_URL`.
 *
 * Každá migrace se spustí v transakci a zapíše se do tabulky
 * `schema_migrations`, takže opakované spuštění už aplikované migrace
 * přeskočí. Existující migrace se nikdy nemění, přidává se nový soubor.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

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
  console.error(
    'Chybí SUPABASE_DB_URL. Zkopíruj .env.example na .env a doplň připojovací\n' +
      'řetězec ze Supabase (Connect → Session pooler URI).',
  );
  process.exit(1);
}

/**
 * Sestaví konfiguraci připojení. Když je v .env `SUPABASE_DB_PASSWORD`,
 * použije se jako heslo (přebije heslo v URL), aby se předešlo chybám
 * s kódováním speciálních znaků v URI.
 */
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

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('Žádné migrace k aplikaci.');
  process.exit(0);
}

const client = new pg.Client(connectionConfig());

try {
  await client.connect();
  // Evidence migrací mimo schéma public, aby public zůstalo bez cizích
  // tabulek (pravidlo „žádná tabulka v public bez RLS", test T-47).
  await client.query('create schema if not exists app_migrations');
  await client.query(
    'create table if not exists app_migrations.applied (name text primary key, applied_at timestamptz not null default now())',
  );
  const applied = new Set(
    (await client.query('select name from app_migrations.applied')).rows.map((r) => r.name),
  );

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= přeskočeno (už aplikováno): ${file}`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`+ aplikuji ${file} ... `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into app_migrations.applied (name) values ($1)', [file]);
      await client.query('commit');
      console.log('OK');
      ran += 1;
    } catch (err) {
      await client.query('rollback');
      console.log('CHYBA');
      console.error(err.message);
      process.exit(1);
    }
  }
  console.log(`\nHotovo. Nově aplikováno: ${ran}, celkem migrací: ${files.length}.`);
} finally {
  await client.end();
}
