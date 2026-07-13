import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SIGILS } from '../onboarding/sigils';
import { colors, spacing } from '../theme/tokens';
import { useBrutality } from '../theme/brutality-context';
import { BrutalText } from './BrutalText';

interface Props {
  mySigilId: string | null;
  theirSigilId: string;
  onDone: () => void;
}

export function MatchMoment({ mySigilId, theirSigilId, onDone }: Props) {
  const { t } = useTranslation();
  const { font } = useBrutality();
  const glyph = (id: string | null) => SIGILS.find((s) => s.id === id)?.glyph ?? '✠';
  return (
    <Pressable style={styles.root} onPress={onDone}>
      <View style={styles.sigils}>
        <Text style={styles.sigil}>{glyph(mySigilId)}</Text>
        <Text style={styles.vs}>⚔︎</Text>
        <Text style={styles.sigil}>{glyph(theirSigilId)}</Text>
      </View>
      <BrutalText text={t('match.title')} font={font('display')} style={styles.title} />
      <Text style={[styles.begin, { fontFamily: font('body') }]}>{t('match.begin')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void, alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  sigils: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  sigil: { fontSize: 64, color: colors.venom },
  vs: { fontSize: 30, color: colors.blood },
  title: { color: colors.bone, fontSize: 22, letterSpacing: 3, textAlign: 'center' },
  begin: { color: colors.blood, fontSize: 14, letterSpacing: 2 },
});
