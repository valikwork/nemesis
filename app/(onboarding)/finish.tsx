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

export default function FinishStep() {
  const { t } = useTranslation();
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
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('onboarding.sealTitle')}</Text>
      <Text style={styles.body}>{t('tagline')}</Text>
      {error != null && <Text style={styles.error}>{error}</Text>}
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
