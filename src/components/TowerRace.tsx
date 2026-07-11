import { View, Text, StyleSheet } from 'react-native';
import { towerGeometry, type TowerEntry } from '../feud/tower-math';
import { colors, radii, spacing } from '../theme/tokens';

interface Props {
  mode: 'endless' | 'showdown';
  goal: number | null;
  myId: string;
  them: string;
  entries: TowerEntry[];
  myName: string;
  theirName: string;
  unit: string;
}

const TOWER_HEIGHT = 220;

function Tower({ height, segments, mist }: { height: number; segments: { fraction: number; chronicled: boolean }[]; mist?: boolean }) {
  return (
    <View style={styles.towerWell}>
      <View style={[styles.tower, { height: Math.max(4, height * TOWER_HEIGHT) }]}>
        {segments.map((s, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { flex: s.fraction },
              s.chronicled ? styles.stone : styles.mistSeg,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function TowerRace({ mode, goal, myId, them, entries, myName, theirName, unit }: Props) {
  const g = towerGeometry({ mode, goal, myId, them, entries });
  return (
    <View style={styles.root}>
      {g.goalLine != null && (
        <View style={[styles.goalLine, { bottom: g.goalLine * TOWER_HEIGHT + LABELS_H }]}>
          <Text style={styles.goalText}>{goal} {unit}</Text>
        </View>
      )}
      <View style={styles.towers}>
        <View style={styles.column}>
          <Tower height={g.myHeight} segments={g.mySegments} />
          <Text style={styles.total}>{g.myTotal} {unit}</Text>
          <Text style={styles.name}>{myName}</Text>
        </View>
        <View style={styles.column}>
          <Tower height={g.theirHeight} segments={g.theirSegments} />
          <Text style={styles.total}>{g.theirTotal} {unit}</Text>
          <Text style={[styles.name, styles.theirName]}>{theirName}</Text>
        </View>
      </View>
    </View>
  );
}

const LABELS_H = 44;

const styles = StyleSheet.create({
  root: { position: 'relative', paddingVertical: spacing[2] },
  towers: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-end' },
  column: { alignItems: 'center', gap: spacing[0] },
  towerWell: { height: TOWER_HEIGHT, justifyContent: 'flex-end' },
  tower: {
    width: 56, borderTopLeftRadius: radii.chip, borderTopRightRadius: radii.chip,
    overflow: 'hidden', flexDirection: 'column-reverse',
  },
  segment: { width: '100%' },
  stone: { backgroundColor: colors.bloodMist, borderTopWidth: 1, borderTopColor: colors.blood },
  mistSeg: { backgroundColor: colors.venomDim, opacity: 0.55, borderTopWidth: 1, borderTopColor: colors.venomDeep },
  total: { color: colors.bone, fontSize: 16, marginTop: spacing[0] },
  name: { color: colors.ash, fontSize: 12, letterSpacing: 1 },
  theirName: { color: colors.venomDeep },
  goalLine: {
    position: 'absolute', left: spacing[3], right: spacing[3],
    borderTopWidth: 1, borderTopColor: colors.blood, borderStyle: 'dashed',
    alignItems: 'flex-end', zIndex: 1,
  },
  goalText: { color: colors.blood, fontSize: 10, letterSpacing: 1, marginTop: 2 },
});
