import { ordealLabel, ordealUnit, type OrdealRow } from '../ordeal-labels';

const catalog: OrdealRow = {
  id: '1', name_en: 'Running', name_uk: 'Біг', unit_en: 'km', unit_uk: 'км',
  name_custom: null, unit_custom: null, is_custom: false, language: null,
};
const custom: OrdealRow = {
  id: '2', name_en: null, name_uk: null, unit_en: null, unit_uk: null,
  name_custom: 'Yodeling', unit_custom: 'yodels', is_custom: true, language: 'en',
};

describe('ordeal labels', () => {
  it('catalog row localizes by language', () => {
    expect(ordealLabel(catalog, 'en')).toBe('Running');
    expect(ordealLabel(catalog, 'uk')).toBe('Біг');
    expect(ordealUnit(catalog, 'uk')).toBe('км');
  });
  it('custom row uses custom fields regardless of viewer language', () => {
    expect(ordealLabel(custom, 'uk')).toBe('Yodeling');
    expect(ordealUnit(custom, 'en')).toBe('yodels');
  });
  it('falls back to en when uk missing', () => {
    const partial = { ...catalog, name_uk: null, unit_uk: null };
    expect(ordealLabel(partial, 'uk')).toBe('Running');
    expect(ordealUnit(partial, 'uk')).toBe('km');
  });
});
