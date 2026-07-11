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
  entries: TowerEntry[];
}

export function towerGeometry({ mode, goal, myId, them, entries }: Args): TowerGeometry {
  const mine = entries.filter((e) => e.author === myId);
  const theirs = entries.filter((e) => e.author === them);
  const sum = (xs: TowerEntry[]) => xs.reduce((acc, e) => acc + Number(e.value), 0);
  const myTotal = sum(mine);
  const theirTotal = sum(theirs);

  const reference = mode === 'showdown' && goal != null ? goal : Math.max(myTotal, theirTotal);
  const norm = (v: number) => (reference <= 0 ? 0 : Math.min(1, v / reference));

  const segments = (xs: TowerEntry[], total: number): TowerSegment[] =>
    total <= 0 ? [] : xs.map((e) => ({ fraction: Number(e.value) / total, chronicled: e.chronicled }));

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
