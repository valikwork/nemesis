// Design System Spec §3–4. Fonts resolve to system until licensed files land.
export type FontSlot = 'logo' | 'display' | 'label' | 'body' | 'numeral';

export interface BrutalityTier {
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly nameKey: string; // i18n key, e.g. 'brutality.1'
  readonly descKey: string; // i18n key for the deadpan description, e.g. 'brutality.1_desc'
  // Family strings are no-space font-registration keys (e.g. 'SoulsideBetrayed').
  // A future useFonts() must register families under these exact strings, or RN
  // silently falls back to the system font. undefined → system font.
  // For the 'numeral' slot, undefined means: inherit the body slot's resolution.
  readonly fonts: Record<FontSlot, string | undefined>;
  readonly dividers: 'straight' | 'jagged' | 'jagged-doubled' | 'streamers';
  readonly radiiScale: number; // multiplier on radii
  readonly buttonTiltDeg: number; // max random rotation
  readonly numerals: 'arabic' | 'roman';
  readonly accent: 'blood-venom' | 'blood' | 'party';
}

export const brutalityTiers: ReadonlyArray<Readonly<BrutalityTier>> = [
  { level: 1, nameKey: 'brutality.1', descKey: 'brutality.1_desc', fonts: { logo: 'Pickyside', display: 'Pickyside', label: 'Pickyside', body: 'Pickyside', numeral: undefined }, dividers: 'straight', radiiScale: 1, buttonTiltDeg: 0, numerals: 'arabic', accent: 'blood-venom' },
  { level: 2, nameKey: 'brutality.2', descKey: 'brutality.2_desc', fonts: { logo: 'Maskdown', display: 'GroovyTribal', label: 'GroovyTribal', body: 'Pickyside', numeral: undefined }, dividers: 'jagged', radiiScale: 1, buttonTiltDeg: 0, numerals: 'arabic', accent: 'blood-venom' },
  // T3 was Arathos (demo file: every letter the same X glyph) -- owner swapped
  // in Groovy Tribal (2026-07-12).
  { level: 3, nameKey: 'brutality.3', descKey: 'brutality.3_desc', fonts: { logo: 'SoulsideBetrayed', display: 'SoulsideBetrayed', label: 'SoulsideBetrayed', body: 'Pickyside', numeral: undefined }, dividers: 'jagged', radiiScale: 0.75, buttonTiltDeg: 1, numerals: 'arabic', accent: 'blood-venom' },
  { level: 4, nameKey: 'brutality.4', descKey: 'brutality.4_desc', fonts: { logo: 'Maskdown', display: 'Maskdown', label: 'Maskdown', body: 'SoulsideBetrayed', numeral: undefined }, dividers: 'jagged-doubled', radiiScale: 0, buttonTiltDeg: 3, numerals: 'roman', accent: 'blood' },
  { level: 5, nameKey: 'brutality.5', descKey: 'brutality.5_desc', fonts: { logo: 'BagelFatOne', display: 'BagelFatOne', label: 'BagelFatOne', body: 'BagelFatOne', numeral: 'BagelFatOne' }, dividers: 'streamers', radiiScale: 1.2, buttonTiltDeg: 5, numerals: 'arabic', accent: 'party' },
];

export function tierFor(level: number): Readonly<BrutalityTier> {
  const clamped = Math.min(5, Math.max(1, Math.round(level)));
  return brutalityTiers[clamped - 1];
}
