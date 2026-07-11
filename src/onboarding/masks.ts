// Placeholder mask set. Real ink illustrations replace `glyph` art later
// (design-system §8, product spec §17) — ids are stable, art is swappable.
export interface Mask {
  id: string;
  glyph: string; // unicode placeholder rendered on a MaskTile until art lands
}

export const MASKS: Mask[] = [
  { id: 'skull_01', glyph: '☠' },
  { id: 'raven_01', glyph: '🜏' },
  { id: 'spear_01', glyph: '🜂' },
  { id: 'shield_01', glyph: '🛡' },
  { id: 'rune_01', glyph: 'ᚱ' },
  { id: 'rune_02', glyph: 'ᛟ' },
  { id: 'rune_03', glyph: 'ᚦ' },
  { id: 'moon_01', glyph: '☾' },
  { id: 'cross_01', glyph: '✠' },
  { id: 'serpent_01', glyph: '§' },
  { id: 'axe_01', glyph: '🜄' },
  { id: 'crown_01', glyph: '♆' },
];
