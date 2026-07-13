import { colors, semantic, spacing, radii } from '../tokens';
import { brutalityTiers, tierFor } from '../brutality';

describe('tokens', () => {
  it('never uses pure white or black', () => {
    const all = Object.values(colors).join(',').toLowerCase();
    expect(all).not.toContain('#fff');
    expect(all).not.toContain('#ffffff');
    expect(all).not.toContain('#000');
  });
  it('has the normative palette', () => {
    expect(colors.bone).toBe('#e8e4da');
    expect(colors.ink).toBe('#0c0b0d');
    expect(colors.blood).toBe('#c9203a');
    expect(colors.venom).toBe('#8a3aa8');
  });
  it('pins the full palette to design-system spec §1', () => {
    expect(colors).toEqual({
      void: '#060507',
      ink: '#0c0b0d',
      crypt: '#100a1a',
      cryptRaised: '#140d21',
      bone: '#e8e4da',
      ash: '#a8a29a',
      smoke: '#5c5450',
      venom: '#8a3aa8',
      venomDim: '#3a2454',
      venomDeep: '#6d5a86',
      blood: '#c9203a',
      bloodDeep: '#6e1111',
      bloodMist: '#4a0d18',
    });
  });
  it('pins the semantic mapping to design-system spec §1', () => {
    expect(semantic).toEqual({
      bg: '#0c0b0d', // ink
      surface: '#100a1a', // crypt
      border: '#3a2454', // venom-dim
      text: '#e8e4da', // bone
      text2: '#a8a29a', // ash
      text3: '#5c5450', // smoke
      accent: '#c9203a', // blood
      accent2: '#8a3aa8', // venom
    });
  });
  it('spacing scale matches spec', () => {
    expect(spacing).toEqual([4, 8, 12, 16, 24, 32]);
  });
  it('radii match spec', () => {
    expect(radii).toEqual({ card: 14, button: 6, chip: 3 });
  });
});

describe('brutality', () => {
  it('has 5 tiers with mutation data', () => {
    expect(brutalityTiers).toHaveLength(5);
    expect(brutalityTiers[3].numerals).toBe('roman');
    expect(brutalityTiers[4].accent).toBe('party');
  });
  it('keeps i18n keys in sync with tier levels', () => {
    for (const tier of brutalityTiers) {
      expect(tier.nameKey).toBe(`brutality.${tier.level}`);
      expect(tier.descKey).toBe(`brutality.${tier.level}_desc`);
    }
  });
  it('pins the full tier 4 mutation data to design-system spec §3-4', () => {
    expect(brutalityTiers[3]).toEqual({
      level: 4,
      nameKey: 'brutality.4',
      descKey: 'brutality.4_desc',
      fonts: {
        logo: 'Maskdown',
        display: 'Maskdown',
        label: 'Maskdown',
        body: 'SoulsideBetrayed',
        numeral: undefined,
      },
      dividers: 'jagged-doubled',
      radiiScale: 0,
      buttonTiltDeg: 3,
      numerals: 'roman',
      accent: 'blood',
    });
  });
  it('tierFor clamps out-of-range values', () => {
    expect(tierFor(0).level).toBe(1);
    expect(tierFor(99).level).toBe(5);
  });
  it('tierFor rounds fractional levels', () => {
    expect(tierFor(2.6).level).toBe(3);
  });
});
