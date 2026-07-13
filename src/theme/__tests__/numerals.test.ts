import { toRoman, formatNumeral } from '../numerals';

describe('toRoman', () => {
  it('converts the classics', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(9)).toBe('IX');
    expect(toRoman(66)).toBe('LXVI');
    expect(toRoman(500)).toBe('D');
    expect(toRoman(3999)).toBe('MMMCMXCIX');
  });
  it('zero is nulla', () => {
    expect(toRoman(0)).toBe('N');
  });
});

describe('formatNumeral', () => {
  it('roman only at roman tiers, integers only, sane range', () => {
    expect(formatNumeral(12, 'roman')).toBe('XII');
    expect(formatNumeral(12, 'arabic')).toBe('12');
    expect(formatNumeral(1.5, 'roman')).toBe('1.5');
    expect(formatNumeral(4000, 'roman')).toBe('4000');
  });
});
