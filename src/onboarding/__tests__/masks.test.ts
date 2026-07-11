import { MASKS } from '../masks';

describe('mask presets', () => {
  it('has at least 12 unique ids', () => {
    expect(MASKS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(MASKS.map((m) => m.id)).size).toBe(MASKS.length);
  });
  it('default skull_01 exists (profiles.mask_avatar_id default)', () => {
    expect(MASKS.some((m) => m.id === 'skull_01')).toBe(true);
  });
});
