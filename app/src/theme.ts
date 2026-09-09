/**
 * Design tokeny – JEDINÝ zdroj barev, mezer a velikostí písma.
 *
 * Pravidlo 8 z CLAUDE.md: žádná barva, mezera ani velikost písma zapsaná
 * přímo v komponentě. Všechno se bere odsud. Kontroluje `npm run lint:styles`.
 *
 * Pravidlo 6: barva nehodnotí jídlo. Paleta je záměrně neutrální, žádná
 * zelená pro „dobré" a červená pro „špatné". `accent` je značková barva,
 * `notice` je klidná informativní barva (např. upozornění „tempo není
 * bezpečné" z F-06), ne poplach.
 */

/** Syrové hodnoty. Barvy se pojmenovávají jen tady, dál se používají role. */
const raw = {
  ink900: '#141a1f',
  ink700: '#3a4550',
  ink500: '#657079',
  ink300: '#aab3bb',
  paper0: '#ffffff',
  paper50: '#f6f8fa',
  paper100: '#eef1f4',
  paper800: '#1b2127',
  paper900: '#11161b',
  line: '#dde3e8',
  lineDark: '#2a323a',
  accent: '#2f7dd1',
  accentDark: '#5aa0e6',
  notice: '#8a6d1f',
  noticeBg: '#fbf3d9',
  // Zelená jen jako referenční „cílová“ linie (např. cílová váha), nikdy
  // k hodnocení jídla (pravidlo 6).
  target: '#2e9e5b',
  targetDark: '#4ec27d',
  // Kategorické barvy grafů – slouží k ROZLIŠENÍ metrik (pití, makra), ne
  // k hodnocení „dobré/špatné“. Zvolené tak, aby se lišily i odstínem jasu.
  water: '#1798a5',
  waterDark: '#3fc0d6',
  macroProtein: '#5b6ee1',
  macroProteinDark: '#8aa0ff',
  macroCarbs: '#d99a2b',
  macroCarbsDark: '#e7b451',
  macroFat: '#b6699a',
  macroFatDark: '#d68cbb',
  // Jemné zvýraznění při najetí myší (hover) – decentní tón odvozený od accentu.
  hover: '#eaf2fb',
  hoverDark: '#243244',
  // Jemné transparentní pozadí pod loading overlayem (doplněné rozostřením).
  scrim: 'rgba(255, 255, 255, 0.3)',
  scrimDark: 'rgba(0, 0, 0, 0.35)',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  onAccent: string;
  notice: string;
  noticeBackground: string;
  targetLine: string;
  ringWater: string;
  macroProtein: string;
  macroCarbs: string;
  macroFat: string;
  hover: string;
  scrim: string;
}

export const lightColors: ThemeColors = {
  background: raw.paper0,
  surface: raw.paper0,
  surfaceElevated: raw.paper50,
  border: raw.line,
  text: raw.ink900,
  textMuted: raw.ink700,
  textFaint: raw.ink500,
  accent: raw.accent,
  onAccent: raw.paper0,
  notice: raw.notice,
  noticeBackground: raw.noticeBg,
  targetLine: raw.target,
  ringWater: raw.water,
  macroProtein: raw.macroProtein,
  macroCarbs: raw.macroCarbs,
  macroFat: raw.macroFat,
  hover: raw.hover,
  scrim: raw.scrim,
};

export const darkColors: ThemeColors = {
  background: raw.paper900,
  surface: raw.paper800,
  surfaceElevated: '#222a31',
  border: raw.lineDark,
  text: raw.paper0,
  textMuted: raw.ink300,
  textFaint: raw.ink500,
  accent: raw.accentDark,
  onAccent: raw.paper900,
  notice: '#e3c766',
  noticeBackground: '#3a3212',
  targetLine: raw.targetDark,
  ringWater: raw.waterDark,
  macroProtein: raw.macroProteinDark,
  macroCarbs: raw.macroCarbsDark,
  macroFat: raw.macroFatDark,
  hover: raw.hoverDark,
  scrim: raw.scrimDark,
};

/** Mezery. Násobky 4, čitelné názvy podle role, ne čísla v komponentě. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const fontSize = {
  caption: 13,
  body: 16,
  subtitle: 20,
  title: 28,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '600',
  bold: '700',
} as const;

/** N-05 přístupnost: minimální velikost cíle dotyku 44 px. */
export const touchTarget = 44;

export type ColorScheme = 'light' | 'dark';

/**
 * Vybere paletu podle schématu. Přijímá i `null`/`undefined`/`'unspecified'`
 * z `useColorScheme`, cokoliv jiného než `'dark'` je světlý režim.
 */
export function colorsFor(scheme: string | null | undefined): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}
