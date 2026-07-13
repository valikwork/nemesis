import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SIGILS } from '../../src/onboarding/sigils';
import { SigilTile } from '../../src/components/SigilTile';
import { GrimButton } from '../../src/components/GrimButton';
import { loadDraft, saveDraft } from '../../src/onboarding/draft';
import { colors, semantic, spacing } from '../../src/theme/tokens';
import { useBrutality } from '../../src/theme/brutality-context';
import { BrutalText } from '../../src/components/BrutalText';

export default function SigilStep() {
  const { t } = useTranslation();
  const { font } = useBrutality();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    loadDraft().then((d) => setSelected(d.maskAvatarId));
  }, []);

  async function next() {
    const draft = await loadDraft();
    await saveDraft({ ...draft, maskAvatarId: selected });
    router.push('/(onboarding)/name');
  }

  return (
    <View style={styles.root}>
      <BrutalText text={t('onboarding.sigilTitle')} font={font('display')} style={styles.title} />
      <FlatList
        data={SIGILS}
        numColumns={4}
        keyExtractor={(s) => s.id}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <SigilTile glyph={item.glyph} selected={selected === item.id} onPress={() => setSelected(item.id)} />
        )}
      />
      <GrimButton label={t('common.next')} onPress={next} disabled={selected == null} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[3] },
  title: { color: colors.bone, fontSize: 24, textAlign: 'center', letterSpacing: 2 },
  grid: { gap: spacing[2] },
  row: { gap: spacing[2], justifyContent: 'center' },
});
