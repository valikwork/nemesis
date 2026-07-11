// Placeholder sigil set. Real ink illustrations replace `glyph` art later
// (design-system §8, product spec §17) — ids are stable, art is swappable.
// Glyphs must be emoji-safe codepoints (runes/alchemical symbols) so nothing
// renders as color emoji on iOS (design-system 2026-07-11 amendment).
export interface Sigil {
  id: string;
  glyph: string; // unicode placeholder rendered on a SigilTile until art lands
}

export const SIGILS: Sigil[] = [
  { id: 'skull_01', glyph: '🜍' },
  { id: 'raven_01', glyph: '🜏' },
  { id: 'spear_01', glyph: '🜂' },
  { id: 'shield_01', glyph: '🜄' },
  { id: 'rune_01', glyph: 'ᚱ' },
  { id: 'rune_02', glyph: 'ᛟ' },
  { id: 'rune_03', glyph: 'ᚦ' },
  { id: 'moon_01', glyph: 'ᛉ' },
  { id: 'cross_01', glyph: '✠' },
  { id: 'serpent_01', glyph: '§' },
  { id: 'axe_01', glyph: 'ᚺ' },
  { id: 'crown_01', glyph: 'ᚾ' },
];
