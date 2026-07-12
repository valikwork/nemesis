import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';
import { useSession } from '../src/auth/session';
import { setAppLanguage } from '../src/i18n';
import { brutalityTiers } from '../src/theme/brutality';
import { validateCatchphrase, validateBio } from '../src/lib/validation';
import { errMessage } from '../src/lib/err';
import { GrimButton } from '../src/components/GrimButton';
import { GrimInput } from '../src/components/GrimInput';
import { colors, radii, semantic, spacing } from '../src/theme/tokens';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const uid = session?.user.id;

  const [catchphrase, setCatchphrase] = useState('');
  const [bio, setBio] = useState('');
  const [tier, setTier] = useState(1);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (uid == null) return;
    supabase.from('profiles').select('catchphrase, bio, brutality_tier, language').eq('id', uid).maybeSingle()
      .then(({ data }) => {
        if (data == null) return;
        setCatchphrase(data.catchphrase ?? '');
        setBio(data.bio ?? '');
        setTier(data.brutality_tier ?? 1);
      });
  }, [uid]);

  async function save() {
    if (uid == null) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { error: e } = await supabase.from('profiles').update({
        catchphrase: catchphrase.trim() || null,
        bio: bio.trim() || null,
        brutality_tier: tier,
      }).eq('id', uid);
      if (e) throw e;
      setSaved(true);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function switchLanguage(lang: 'en' | 'uk') {
    await setAppLanguage(lang);
    if (uid != null) await supabase.from('profiles').update({ language: lang }).eq('id', uid);
  }

  async function signOut() {
    await supabase.auth.signOut(); // guard routes to the gate
  }

  async function erase() {
    setBusy(true);
    try {
      await supabase.functions.invoke('delete-account');
    } catch {
      // even on failure fall through to sign-out; dead-session healing covers stragglers
    }
    await supabase.auth.signOut();
  }

  const lang = i18n.language === 'uk' ? 'uk' : 'en';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.root}>
      <Text style={styles.title}>{t('settings.title')}</Text>

      <Text style={styles.section}>{t('settings.persona')}</Text>
      <Text style={styles.fieldLabel}>{t('onboarding.catchphraseTitle')}</Text>
      <GrimInput value={catchphrase} onChangeText={setCatchphrase}
        placeholder={t('onboarding.catchphrasePlaceholder')}
        error={validateCatchphrase(catchphrase) ? t(`validation.${validateCatchphrase(catchphrase)}`) : null} />
      <Text style={styles.fieldLabel}>{t('onboarding.bioTitle')}</Text>
      <GrimInput value={bio} onChangeText={setBio} multiline numberOfLines={4} style={styles.bioInput}
        placeholder="…"
        error={validateBio(bio) ? t(`validation.${validateBio(bio)}`) : null} />

      <Text style={styles.section}>{t('settings.language')}</Text>
      <View style={styles.langRow}>
        {(['en', 'uk'] as const).map((l) => (
          <Pressable key={l} onPress={() => switchLanguage(l)}
            style={[styles.langChip, lang === l && styles.langChipOn]}>
            <Text style={[styles.langText, lang === l && styles.langTextOn]}>
              {l === 'en' ? 'English' : 'Українська'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>{t('brutality.title')}</Text>
      {brutalityTiers.map((bt) => (
        <Pressable key={bt.level} onPress={() => setTier(bt.level)}
          style={[styles.tierRow, tier === bt.level && styles.tierRowOn]}>
          <Text style={[styles.tierName, tier === bt.level && styles.tierNameOn]}>{t(bt.nameKey)}</Text>
          <Text style={styles.tierDesc}>{t(bt.descKey)}</Text>
        </Pressable>
      ))}

      {error != null && <Text style={styles.error}>{error}</Text>}
      {saved && <Text style={styles.savedText}>{t('settings.saved')}</Text>}
      <GrimButton label={t('settings.save')} onPress={save}
        disabled={busy || validateCatchphrase(catchphrase) != null || validateBio(bio) != null} />
      <GrimButton label={t('settings.signOut')} variant="ghost" onPress={signOut} />

      <Text style={[styles.section, styles.danger]}>{t('settings.dangerZone')}</Text>
      <GrimButton label={t('settings.deleteAccount')} variant="ghost" onPress={() => setEraseOpen(true)} />
      <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />

      <Modal visible={eraseOpen} transparent animationType="fade" onRequestClose={() => setEraseOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t('settings.deleteAccount')}</Text>
            <Text style={styles.eraseBody}>{t('settings.eraseBody')}</Text>
            <GrimButton label={t('settings.deleteAccount')} onPress={erase} disabled={busy} />
            <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => setEraseOpen(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: semantic.bg },
  root: { padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  title: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  section: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: spacing[3] },
  fieldLabel: { color: colors.ash, fontSize: 12, letterSpacing: 1 },
  bioInput: { minHeight: 90, textAlignVertical: 'top' },
  langRow: { flexDirection: 'row', gap: spacing[2] },
  langChip: { flex: 1, alignItems: 'center', paddingVertical: spacing[2], borderRadius: radii.button, borderWidth: 1, borderColor: colors.venomDim, backgroundColor: colors.crypt },
  langChipOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  langText: { color: colors.ash, fontSize: 14 },
  langTextOn: { color: colors.bone },
  tierRow: { backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim, borderRadius: radii.button, padding: spacing[2] },
  tierRowOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  tierName: { color: colors.ash, fontSize: 15 },
  tierNameOn: { color: colors.bone },
  tierDesc: { color: colors.smoke, fontSize: 11, marginTop: 2 },
  error: { color: colors.blood, fontSize: 13 },
  savedText: { color: colors.venom, fontSize: 13, textAlign: 'center' },
  danger: { color: colors.blood },
  eraseBody: { color: colors.ash, fontSize: 14, textAlign: 'center' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.9)', justifyContent: 'center', padding: spacing[4] },
  modal: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[4], gap: spacing[2] },
});
