// Pure text-mangling helpers for the tier-4/5 display treatments (owner
// direction, 2026-07-12): Maskdown words become mirrored metal-logo halves,
// Bagel Fat One letters each get a bright party color.

/** First and last letter uppercase, the rest lowercase: HUNTING → HuntinG. */
export function metalCase(word: string): string {
  if (word.length <= 2) return word.toUpperCase();
  return word[0].toUpperCase() + word.slice(1, -1).toLowerCase() + word[word.length - 1].toUpperCase();
}

/** Split a word for the mirror layout: right half is rendered flipped
 * (scaleX -1) so its letters "look left" — proper metal band symmetry.
 * Casing happens AFTER the split (owner, 2026-07-12): the flip reverses the
 * right half's visual order, so its FIRST char is the letter the viewer sees
 * last — that's the one that gets the uppercase. */
export function metalHalves(word: string): { left: string; right: string } {
  const mid = Math.ceil(word.length / 2);
  const rawLeft = word.slice(0, mid);
  const rawRight = word.slice(mid);
  const left = rawLeft[0].toUpperCase() + rawLeft.slice(1).toLowerCase();
  const right = rawRight === '' ? '' : rawRight[0].toUpperCase() + rawRight.slice(1).toLowerCase();
  return { left, right };
}

export const PARTY_PALETTE = [
  '#ff3b30', '#ff9500', '#ffcc00', '#34c759',
  '#00c7be', '#32ade6', '#af52de', '#ff2d55',
] as const;

/** Deterministic per-letter color: same text always colors the same way —
 * random-looking, but no flicker across re-renders. */
export function partyColor(text: string, index: number): string {
  let h = index * 31;
  for (let i = 0; i < text.length; i++) h = (h * 33 + text.charCodeAt(i)) >>> 0;
  return PARTY_PALETTE[h % PARTY_PALETTE.length];
}
