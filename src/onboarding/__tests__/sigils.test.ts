import { SIGILS } from '../sigils';

describe('sigil presets', () => {
  it('has at least 12 unique ids', () => {
    expect(SIGILS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SIGILS.map((s) => s.id)).size).toBe(SIGILS.length);
  });
  it('default skull_01 exists (profiles.mask_avatar_id default)', () => {
    expect(SIGILS.some((s) => s.id === 'skull_01')).toBe(true);
  });
});
