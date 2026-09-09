/**
 * Sdílený filtr kvality názvů potravin pro importy (OFF API i data dump).
 *
 * Cíl: nepustit do DB balast, který kazí vyhledávání – emoji v názvu,
 * převážně cizojazyčné (nelatinkové) názvy, útržky typu „1/2 Beutel ...",
 * prázdné či příliš dlouhé řetězce. Pravidla jsou záměrně konzervativní:
 * radši zahodit nejasný záznam než zaplevelit výsledky.
 */

const PICTO = /\p{Extended_Pictographic}/u;

/** Vybere nejvhodnější název z produktu OFF (dump i API): cs → sk → en → obecný. */
export function pickName(p) {
  const cand = [
    p.product_name_cs,
    p.product_name_sk,
    p.product_name_cz,
    typeof p.product_name === 'string' ? p.product_name : null,
    p.product_name_en,
    p.generic_name_cs,
    p.generic_name,
  ];
  if (p.product_name && typeof p.product_name === 'object') {
    cand.push(p.product_name.cs, p.product_name.sk, p.product_name.en, ...Object.values(p.product_name));
  }
  for (const c of cand) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

/**
 * Vrátí true, pokud je název rozumný k zobrazení českému uživateli.
 * Kontroly: délka, dostatek písmen, převaha latinky, žádné úvodní emoji,
 * žádné zlomkové útržky na začátku.
 */
export function isReasonableName(name) {
  if (!name) return false;
  const n = String(name).trim();
  if (n.length < 2 || n.length > 120) return false;

  const letters = (n.match(/\p{L}/gu) || []).length;
  if (letters < 3) return false;

  // Převaha latinky (odfiltruje azbuku, CJK, arabštinu, řečtinu apod.).
  const latin = (n.match(/\p{Script=Latin}/gu) || []).length;
  if (latin / letters < 0.7) return false;

  // Žádné emoji / piktogramy kdekoliv v názvu.
  if (PICTO.test(n)) return false;

  // Útržky typu „1/2 ...", „250 g ...", které nejsou názvem potraviny.
  if (/^\d+\s*\/\s*\d+\b/.test(n)) return false;

  return true;
}
