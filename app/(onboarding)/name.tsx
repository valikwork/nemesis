import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { loadDraft, saveDraft } from '../../src/onboarding/draft';
import { validateNemesisName, validateCatchphrase } from '../../src/lib/validation';
import { colors, semantic, spacing } from '../../src/theme/tokens';

export default function NameStep() {
  const { t } = useTranslation();
  const router = useRouter();
  const [name, setName] = useState('');
  const [catchphrase, setCatchphrase] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    loadDraft().then((d) => { setName(d.nemesisName); setCatchphrase(d.catchphrase); });
  }, []);

  const nameError = touched ? validateNemesisName(name) : null;
  const phraseError = validateCatchphrase(catchphrase);

  async function next() {
    const draft = await loadDraft();
    await saveDraft({ ...draft, nemesisName: name.trim(), catchphrase: catchphrase.trim() });
    router.push('/(onboarding)/bio');
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('onboarding.nameTitle')}</Text>
      <GrimInput value={name} onChangeText={(v) => { setName(v); setTouched(true); }}
        placeholder={t('onboarding.namePlaceholder')}
        error={nameError ? t(`validation.${nameError}`) : null} />
      <Text style={styles.title2}>{t('onboarding.catchphraseTitle')}</Text>
      <GrimInput value={catchphrase} onChangeText={setCatchphrase}
        placeholder={t('onboarding.catchphrasePlaceholder')}
        error={phraseError ? t(`validation.${phraseError}`) : null} />
      <GrimButton label={t('common.next')} onPress={next}
        disabled={validateNemesisName(name) != null || phraseError != null} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  title: { color: colors.bone, fontSize: 24, textAlign: 'center', letterSpacing: 2 },
  title2: { color: colors.bone, fontSize: 18, textAlign: 'center', letterSpacing: 2, marginTop: spacing[3] },
});
