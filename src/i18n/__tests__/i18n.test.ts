import en from '../en.json';
import uk from '../uk.json';
import { brutalityTiers } from '../../theme/brutality';

function keysOf(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function resolve(obj: any, dottedKey: string): unknown {
  return dottedKey.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

describe('i18n catalogs', () => {
  it('en and uk have identical key sets', () => {
    expect(keysOf(uk).sort()).toEqual(keysOf(en).sort());
  });
  it('no empty strings', () => {
    const all = [...keysOf(en), ...keysOf(uk)];
    expect(all.length).toBeGreaterThan(40);
    expect(JSON.stringify([en, uk])).not.toContain('""');
  });
  it('core glossary present', () => {
    expect(en.glossary.feud).toBe('Feud');
    expect(uk.glossary.feud).toBe('Ворожнеча');
  });
  it('every brutality tier nameKey and descKey resolves in both catalogs', () => {
    for (const tier of brutalityTiers) {
      for (const key of [tier.nameKey, tier.descKey]) {
        expect(typeof resolve(en, key)).toBe('string');
        expect(typeof resolve(uk, key)).toBe('string');
      }
    }
  });
  it('plan-2 keys present', () => {
    for (const key of [
      'common.next', 'common.confirm', 'common.cancel',
      'validation.tooShort', 'validation.tooLong',
      'auth.enter', 'auth.rise', 'auth.toSignUp', 'auth.toSignIn',
      'onboarding.skillHintTitle', 'onboarding.sealTitle', 'onboarding.sealCta',
    ]) {
      const resolveIn = (cat: object) => key.split('.').reduce((o: any, k) => o?.[k], cat);
      expect(typeof resolveIn(en)).toBe('string');
      expect(typeof resolveIn(uk)).toBe('string');
    }
  });
});
