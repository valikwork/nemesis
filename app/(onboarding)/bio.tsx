import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { loadDraft, saveDraft } from '../../src/onboarding/draft';
import { validateBio } from '../../src/lib/validation';
import { colors, semantic, spacing } from '../../src/theme/tokens';

export default function BioStep() {
  const { t } = useTranslation();
  const router = useRouter();
  const [bio, setBio] = useState('');

  useEffect(() => { loadDraft().then((d) => setBio(d.bio)); }, []);

  const bioError = validateBio(bio);

  async function next() {
    const draft = await loadDraft();
    await saveDraft({ ...draft, bio: bio.trim() });
    router.push('/(onboarding)/ordeals');
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('onboarding.bioTitle')}</Text>
      <GrimInput value={bio} onChangeText={setBio} multiline numberOfLines={5}
        style={styles.bioInput} placeholder="…"
        error={bioError ? t(`validation.${bioError}`) : null} />
      <GrimButton label={t('common.next')} onPress={next} disabled={bioError != null} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  title: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  bioInput: { minHeight: 120, textAlignVertical: 'top' },
});
