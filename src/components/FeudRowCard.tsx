import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FeudWithMeta } from '../lib/feuds';
import { ordealLabel, ordealUnit } from '../onboarding/ordeal-labels';
import { SIGILS } from '../onboarding/sigils';
import { colors, radii, spacing } from '../theme/tokens';

interface Props {
  item: FeudWithMeta;
  onPress: () => void;
}

export function FeudRowCard({ item, onPress }: Props) {
  const { t, i18n } = useTranslation();
  const glyph = SIGILS.find((s) => s.id === item.opponent.mask_avatar_id)?.glyph ?? '✠';
  const ended = item.feud.status !== 'active';
  return (
    <Pressable onPress={onPress} style={[styles.card, ended && styles.ended]}>
      <Text style={styles.sigil}>{glyph}</Text>
      <View style={styles.mid}>
        <Text style={styles.opponent}>{item.opponent.nemesis_name}</Text>
        <Text style={styles.ordeal}>
          {ordealLabel(item.ordeal, i18n.language)}
          {item.feud.mode === 'showdown' && item.feud.goal_value != null
            ? ` · ${t('feud.modeShowdown', { goal: item.feud.goal_value })}`
            : ''}
        </Text>
        {item.goneSoft && <Text style={styles.goneSoft}>{t('feud.goneSoft')}</Text>}
      </View>
      <View style={styles.scores}>
        <Text style={styles.score}>{item.myTotal} : {item.theirTotal}</Text>
        {item.feud.mode === 'showdown' && (
          <Text style={styles.unit}>{ordealUnit(item.ordeal, i18n.language)}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.card, padding: spacing[3],
  },
  ended: { opacity: 0.55 },
  sigil: { fontSize: 28, color: colors.venom },
  mid: { flex: 1 },
  opponent: { color: colors.bone, fontSize: 16 },
  ordeal: { color: colors.smoke, fontSize: 12, marginTop: 2 },
  goneSoft: { color: colors.venomDeep, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  scores: { alignItems: 'flex-end' },
  score: { color: colors.bone, fontSize: 16 },
  unit: { color: colors.smoke, fontSize: 10 },
});
