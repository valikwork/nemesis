import { metalCase, metalHalves, partyColor, PARTY_PALETTE } from '../brutal-text';

describe('metalCase', () => {
  it('uppercases first and last, lowercases the middle', () => {
    expect(metalCase('HUNTING')).toBe('HuntinG');
    expect(metalCase('nemesis')).toBe('NemesiS');
  });
  it('short words go full uppercase', () => {
    expect(metalCase('a')).toBe('A');
    expect(metalCase('of')).toBe('OF');
  });
});

describe('metalHalves', () => {
  it('splits the cased word in the middle, left gets the odd extra', () => {
    expect(metalHalves('NEMESIS')).toEqual({ left: 'Neme', right: 'siS' });
    expect(metalHalves('GROUNDS')).toEqual({ left: 'Grou', right: 'ndS' });
    expect(metalHalves('ab')).toEqual({ left: 'A', right: 'B' });
  });
});

describe('partyColor', () => {
  it('is deterministic and draws from the palette', () => {
    const c1 = partyColor('VICTORY', 3);
    expect(partyColor('VICTORY', 3)).toBe(c1);
    expect(PARTY_PALETTE).toContain(c1);
  });
  it('varies across letters', () => {
    const colors = new Set([...Array(8)].map((_, i) => partyColor('SUMMON A FRIEND', i)));
    expect(colors.size).toBeGreaterThan(1);
  });
});
