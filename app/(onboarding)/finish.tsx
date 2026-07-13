import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { GrimButton } from '../../src/components/GrimButton';
import { loadDraft, clearDraft } from '../../src/onboarding/draft';
import { completeOnboarding } from '../../src/onboarding/complete';
import { registerPushToken } from '../../src/lib/push';
import { useSession } from '../../src/auth/session';
import { colors, semantic, spacing } from '../../src/theme/tokens';
import { useBrutality } from '../../src/theme/brutality-context';
import { BrutalText } from '../../src/components/BrutalText';
import { errMessage } from '../../src/lib/err';

export default function FinishStep() {
  const { t } = useTranslation();
  const { font } = useBrutality();
  const body = { fontFamily: font('body') };
  const { refreshProfile } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function seal() {
    setBusy(true);
    setError(null);
    try {
      const draft = await loadDraft();
      if (draft.catchphrase.trim() === '') {
        draft.catchphrase = t('onboarding.catchphrasePlaceholder');
      }
      await completeOnboarding(supabase, draft);
      await clearDraft();
      await refreshProfile(); // root guard sees hasProfile → routes home
      supabase.auth.getUser().then(({ data }) => {
        if (data.user != null) registerPushToken(supabase, data.user.id);
      }); // fire-and-forget: push is optional, must not block routing
    } catch (e) {
      setError(errMessage(e));
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <BrutalText text={t('onboarding.sealTitle')} font={font('display')} style={styles.title} />
      <Text style={[styles.body, body]}>{t('tagline')}</Text>
      {error != null && <Text style={[styles.error, body]}>{error}</Text>}
      <GrimButton label={t('onboarding.sealCta')} onPress={seal} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, justifyContent: 'center', padding: spacing[4], gap: spacing[2] },
  title: { color: colors.bone, fontSize: 24, textAlign: 'center', letterSpacing: 2 },
  body: { color: colors.venomDeep, fontSize: 14, textAlign: 'center' },
  error: { color: colors.blood, fontSize: 13, textAlign: 'center' },
});
