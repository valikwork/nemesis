import { towerGeometry } from '../tower-math';

const entry = (author: string, value: number, proof: boolean) => ({
  author, value, chronicled: proof,
});

describe('towerGeometry', () => {
  it('endless: normalizes to the leader', () => {
    const g = towerGeometry({
      mode: 'endless', goal: null, myId: 'me',
      entries: [entry('me', 30, true), entry('them', 60, false)],
      them: 'them',
    });
    expect(g.myHeight).toBeCloseTo(0.5);
    expect(g.theirHeight).toBeCloseTo(1);
    expect(g.goalLine).toBeNull();
  });

  it('showdown: normalizes to goal, capped at 1', () => {
    const g = towerGeometry({
      mode: 'showdown', goal: 100, myId: 'me',
      entries: [entry('me', 120, true), entry('them', 40, true)],
      them: 'them',
    });
    expect(g.myHeight).toBe(1);
    expect(g.theirHeight).toBeCloseTo(0.4);
    expect(g.goalLine).toBe(1);
  });

  it('builds per-entry segments with chronicled flag, in order', () => {
    const g = towerGeometry({
      mode: 'endless', goal: null, myId: 'me',
      entries: [entry('me', 10, true), entry('me', 30, false)],
      them: 'them',
    });
    expect(g.mySegments).toEqual([
      { fraction: 0.25, chronicled: true },
      { fraction: 0.75, chronicled: false },
    ]);
    expect(g.theirSegments).toEqual([]);
  });

  it('zero scores: both towers zero height, no NaN', () => {
    const g = towerGeometry({ mode: 'endless', goal: null, myId: 'me', entries: [], them: 'them' });
    expect(g.myHeight).toBe(0);
    expect(g.theirHeight).toBe(0);
    expect(Number.isNaN(g.myHeight)).toBe(false);
  });
});
