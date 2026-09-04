#!/usr/bin/env node
/**
 * lint:styles – základní vynucení pravidla 8 z CLAUDE.md:
 * „Žádná barva, mezera ani velikost písma napsaná přímo. Vše z
 * app/src/theme.ts."
 *
 * Tohle je startovní kontrola pro skeleton: hledá zapsané barvy (hex a
 * rgb/rgba) v komponentách pod app/src, kromě jediného povoleného zdroje
 * app/src/theme.ts. Postupně se sem doplní kontrola mezer a velikostí
 * písma, až budou obrazovky bohatší.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const APP_SRC = join(ROOT, 'app', 'src');
const ALLOWED = new Set([join('app', 'src', 'theme.ts')]);
const EXT = new Set(['.ts', '.tsx']);
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (EXT.has(name.slice(name.lastIndexOf('.')))) {
      out.push(full);
    }
  }
  return out;
}

if (!existsSync(APP_SRC)) {
  console.log('lint:styles: app/src neexistuje, přeskakuji.');
  process.exit(0);
}

const violations = [];
for (const file of walk(APP_SRC)) {
  const rel = relative(ROOT, file).split('/').join(sep);
  if (ALLOWED.has(rel)) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (COLOR.test(line)) {
      violations.push(`${rel}:${i + 1}  ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error('lint:styles: nalezena přímo zapsaná barva (patří do app/src/theme.ts):');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}

console.log('lint:styles: v pořádku, žádná přímo zapsaná barva mimo theme.ts.');
