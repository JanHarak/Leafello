/**
 * Vícejazyčnost (N-04).
 *
 * Zásady ze zadání:
 * - Čeština je **zdrojový a primární jazyk**. Chybějící text padá na
 *   češtinu, nikdy se nezobrazí prázdno.
 * - Seznam jazyků drží **jediný registr v aplikaci** (`LANGUAGES`).
 *   Přidání jazyka = jeden záznam tady + jeden soubor v `locales/`.
 *   Žádná databázová migrace, žádný zásah do komponent.
 * - Jazyk má stav: `source` (čeština), `released` (úplný, vydaný) a
 *   `beta` (chybějící texty padají na češtinu).
 * - Plurály se řeší podle **CLDR** přes `Intl.PluralRules`, ne ručními
 *   podmínkami. Čeština má tři formy pro celá čísla (one/few/other) a
 *   čtvrtou (many) pro desetinná.
 */
import cs from './locales/cs.json';
import sk from './locales/sk.json';
import en from './locales/en.json';

export type LanguageState = 'source' | 'released' | 'beta';

export interface Language {
  code: string;
  /** Název jazyka v daném jazyce. */
  label: string;
  state: LanguageState;
}

export const SOURCE_LANGUAGE = 'cs';

/** Jediný registr jazyků. Přidání jazyka začíná tady. */
export const LANGUAGES: readonly Language[] = [
  { code: 'cs', label: 'Čeština', state: 'source' },
  { code: 'sk', label: 'Slovenčina', state: 'released' },
  { code: 'en', label: 'English', state: 'released' },
];

type Bundle = Record<string, unknown>;
const BUNDLES: Record<string, Bundle> = { cs, sk, en };

let active = SOURCE_LANGUAGE;

export function getLanguage(): string {
  return active;
}

export function setLanguage(code: string): void {
  if (BUNDLES[code]) active = code;
}

export type Vars = Record<string, string | number>;

function lookup(bundle: Bundle, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object' && part in (node as Bundle)) {
      return (node as Bundle)[part];
    }
    return undefined;
  }, bundle);
}

/** Najde hodnotu v aktivním jazyce, jinak padá na češtinu (SOURCE_LANGUAGE). */
function resolve(key: string): unknown {
  const inActive = lookup(BUNDLES[active] ?? {}, key);
  if (inActive !== undefined) return inActive;
  return lookup(BUNDLES[SOURCE_LANGUAGE], key);
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

/** Přeloží klíč. Chybějící klíč vrátí sám sebe jako signál pro vývoj. */
export function t(key: string, vars?: Vars): string {
  const value = resolve(key);
  if (typeof value !== 'string') return key;
  return interpolate(value, vars);
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

function categoryFor(locale: string, count: number): Intl.LDMLPluralRule {
  try {
    let rules = pluralRulesCache.get(locale);
    if (!rules) {
      rules = new Intl.PluralRules(locale);
      pluralRulesCache.set(locale, rules);
    }
    return rules.select(count);
  } catch {
    // Fallback pro prostředí bez Intl.PluralRules.
    return count === 1 && Number.isInteger(count) ? 'one' : 'other';
  }
}

/**
 * Plurál podle CLDR. Klíč ukazuje na objekt s formami, např.
 * `{ "one": "{count} den", "few": "{count} dny", "other": "{count} dní" }`.
 */
export function plural(key: string, count: number, vars?: Vars): string {
  const forms = resolve(key);
  if (typeof forms !== 'object' || forms === null) return key;
  const table = forms as Record<string, string>;
  const category = categoryFor(active, count);
  const chosen = table[category] ?? table.other ?? table.many ?? table.one;
  if (typeof chosen !== 'string') return key;
  return interpolate(chosen, { ...vars, count });
}
