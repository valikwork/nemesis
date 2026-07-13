import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { loadDraft, saveDraft } from '../../src/onboarding/draft';
import { validateNemesisName } from '../../src/lib/validation';
import { colors, semantic, spacing } from '../../src/theme/tokens';
import { useBrutality } from '../../src/theme/brutality-context';
import { BrutalText } from '../../src/components/BrutalText';

export default function NameStep() {
  const { t } = useTranslation();
  const { font } = useBrutality();
  const router = useRouter();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    loadDraft().then((d) => { setName(d.nemesisName); });
  }, []);

  const nameError = touched ? validateNemesisName(name) : null;

  async function next() {
    const draft = await loadDraft();
    await saveDraft({ ...draft, nemesisName: name.trim() });
    router.push('/(onboarding)/ordeals');
  }

  return (
    <View style={styles.root}>
      <BrutalText text={t('onboarding.nameTitle')} font={font('display')} style={styles.title} />
      <GrimInput value={name} onChangeText={(v) => { setName(v); setTouched(true); }}
        placeholder={t('onboarding.namePlaceholder')}
        error={nameError ? t(`validation.${nameError}`) : null} />
      <GrimButton label={t('common.next')} onPress={next}
        disabled={validateNemesisName(name) != null} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, justifyContent: 'center', padding: spacing[4], gap: spacing[2] },
  title: { color: colors.bone, fontSize: 24, textAlign: 'center', letterSpacing: 2 },
});
