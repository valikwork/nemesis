import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Switch } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ordealLabel, type OrdealRow } from '../onboarding/ordeal-labels';
import { GrimButton } from './GrimButton';
import { useBrutality } from '../theme/brutality-context';
import { GrimInput } from './GrimInput';
import { colors, radii, spacing } from '../theme/tokens';

interface Props {
  visible: boolean;
  sharedOrdeals: OrdealRow[];
  busy: boolean;
  error: string | null;
  onThrow: (args: { ordealId: string; mode: 'endless' | 'showdown'; goal: number | null }) => void;
  onClose: () => void;
}

/** Post-match terms sheet: pick a shared ordeal, endless or showdown-to-goal. */
export function GloveSheet({ visible, sharedOrdeals, busy, error, onThrow, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { font } = useBrutality();
  const body = { fontFamily: font('body') };
  const [ordealId, setOrdealId] = useState<string | null>(null);
  const [showdown, setShowdown] = useState(true); // showdown is the default mode (owner, 5b walk)
  const [goal, setGoal] = useState('');

  useEffect(() => {
    if (visible) {
      setOrdealId(sharedOrdeals[0]?.id ?? null);
      setShowdown(true);
      setGoal('');
    }
  }, [visible]);

  const goalNum = Number(goal);
  const goalValid = !showdown || (Number.isFinite(goalNum) && goalNum > 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('deck.throwGlove')}</Text>
          {sharedOrdeals.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => setOrdealId(o.id)}
              style={[styles.pickRow, ordealId === o.id && styles.pickRowOn]}
            >
              <Text style={[styles.pickLabel, body, ordealId === o.id && styles.pickLabelOn]}>
                {ordealLabel(o, i18n.language)}
              </Text>
            </Pressable>
          ))}
          <View style={styles.modeRow}>
            <Text style={[styles.modeLabel, body]}>
              {showdown ? t('feud.modeShowdown', { goal: goal || '…' }) : t('feud.modeEndless')}
            </Text>
            <Switch value={showdown} onValueChange={setShowdown}
              trackColor={{ false: colors.venomDim, true: colors.bloodDeep }} thumbColor={colors.bone} />
          </View>
          {showdown && <GrimInput value={goal} onChangeText={setGoal} placeholder="100" keyboardType="numeric" />}
          {error != null && <Text style={styles.error}>{error}</Text>}
          <GrimButton
            label={t('summon.create')}
            disabled={busy || ordealId == null || !goalValid}
            onPress={() => {
              if (ordealId == null) return;
              onThrow({ ordealId, mode: showdown ? 'showdown' : 'endless', goal: showdown ? goalNum : null });
            }}
          />
          <GrimButton label={t('common.cancel')} variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.85)', justifyContent: 'center', padding: spacing[4] },
  sheet: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[4], gap: spacing[2] },
  title: { color: colors.bone, fontSize: 20, textAlign: 'center', letterSpacing: 1 },
  pickRow: {
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.button, paddingVertical: spacing[2], paddingHorizontal: spacing[3],
  },
  pickRowOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  pickLabel: { color: colors.ash, fontSize: 15 },
  pickLabelOn: { color: colors.bone },
  modeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeLabel: { color: colors.ash, fontSize: 14 },
  error: { color: colors.blood, fontSize: 13, textAlign: 'center' },
});
