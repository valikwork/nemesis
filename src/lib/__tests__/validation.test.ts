import { validateNemesisName, validateCatchphrase, validateBio, validateSkillHint, validateOrdealName, validateOrdealUnit } from '../validation';

describe('validation (mirrors data-contract checks)', () => {
  it('nemesis name: 2-40 chars, trimmed', () => {
    expect(validateNemesisName('Doomrider Kevin')).toBeNull();
    expect(validateNemesisName(' x ')).toBe('tooShort');
    expect(validateNemesisName('')).toBe('tooShort');
    expect(validateNemesisName('a'.repeat(41))).toBe('tooLong');
    expect(validateNemesisName('ab')).toBeNull();
  });
  it('catchphrase: optional, max 80', () => {
    expect(validateCatchphrase('')).toBeNull();
    expect(validateCatchphrase('a'.repeat(80))).toBeNull();
    expect(validateCatchphrase('a'.repeat(81))).toBe('tooLong');
  });
  it('bio: optional, max 500', () => {
    expect(validateBio('')).toBeNull();
    expect(validateBio('a'.repeat(501))).toBe('tooLong');
  });
  it('skill hint: optional, max 30', () => {
    expect(validateSkillHint('1450 elo')).toBeNull();
    expect(validateSkillHint('a'.repeat(31))).toBe('tooLong');
  });
  it('custom ordeal name 2-40 / unit 1-20', () => {
    expect(validateOrdealName('Yodeling')).toBeNull();
    expect(validateOrdealName('y')).toBe('tooShort');
    expect(validateOrdealUnit('yodels')).toBeNull();
    expect(validateOrdealUnit('')).toBe('tooShort');
    expect(validateOrdealUnit('a'.repeat(21))).toBe('tooLong');
  });
});
