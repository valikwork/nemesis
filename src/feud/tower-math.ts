export interface TowerEntry {
  author: string;
  value: number;
  chronicled: boolean; // proof attached → stone; rumor → mist
}

export interface TowerSegment {
  fraction: number; // of the OWNER's own total (segments stack to 1)
  chronicled: boolean;
}

export interface TowerGeometry {
  myTotal: number;
  theirTotal: number;
  myHeight: number; // 0..1 of drawable height
  theirHeight: number;
  goalLine: number | null; // 0..1 position, showdown only
  mySegments: TowerSegment[];
  theirSegments: TowerSegment[];
}

interface Args {
  mode: 'endless' | 'showdown';
  goal: number | null;
  myId: string;
  them: string;
  entries: TowerEntry[]; // chronological (oldest first)
  aggregation?: 'sum' | 'latest';
}

export function towerGeometry({ mode, goal, myId, them, entries, aggregation = 'sum' }: Args): TowerGeometry {
  const mine = entries.filter((e) => e.author === myId);
  const theirs = entries.filter((e) => e.author === them);
  const sum = (xs: TowerEntry[]) => xs.reduce((acc, e) => acc + Number(e.value), 0);
  // 'latest' ordeals track a level, not a tally: the newest entry IS the tower
  const total = (xs: TowerEntry[]) =>
    aggregation === 'latest' ? Number(xs[xs.length - 1]?.value ?? 0) : sum(xs);
  const myTotal = total(mine);
  const theirTotal = total(theirs);

  const reference = mode === 'showdown' && goal != null ? goal : Math.max(myTotal, theirTotal);
  const norm = (v: number) => (reference <= 0 ? 0 : Math.min(1, v / reference));

  const segments = (xs: TowerEntry[], t: number): TowerSegment[] => {
    if (t <= 0) return [];
    if (aggregation === 'latest') {
      const last = xs[xs.length - 1];
      return last == null ? [] : [{ fraction: 1, chronicled: last.chronicled }];
    }
    return xs.map((e) => ({ fraction: Number(e.value) / t, chronicled: e.chronicled }));
  };

  return {
    myTotal,
    theirTotal,
    myHeight: norm(myTotal),
    theirHeight: norm(theirTotal),
    goalLine: mode === 'showdown' ? 1 : null,
    mySegments: segments(mine, myTotal),
    theirSegments: segments(theirs, theirTotal),
  };
}
