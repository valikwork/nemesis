// T4 renders numbers as roman numerals (design-system §4 mutation table).
// Zero has no roman form — 'N' (nulla), the medieval convention, fits the bit.

const ROMAN: Array<[number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function toRoman(n: number): string {
  if (n === 0) return 'N';
  let rest = n;
  let out = '';
  for (const [v, sym] of ROMAN) {
    while (rest >= v) {
      out += sym;
      rest -= v;
    }
  }
  return out;
}

/** Tier-aware number rendering. Non-integers and out-of-range values keep
 * arabic digits even at T4 — roman fractions would be a war crime. */
export function formatNumeral(n: number, numerals: 'arabic' | 'roman'): string {
  if (numerals === 'roman' && Number.isInteger(n) && n >= 0 && n < 4000) return toRoman(n);
  return String(n);
}
