import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { useSession } from '../../src/auth/session';
import { getInvite, acceptInvite, type InviteLanding } from '../../src/lib/feuds';
import { ordealLabel } from '../../src/onboarding/ordeal-labels';
import { SIGILS } from '../../src/onboarding/sigils';
import { GrimButton } from '../../src/components/GrimButton';
import { MatchMoment } from '../../src/components/MatchMoment';
import { colors, semantic, spacing } from '../../src/theme/tokens';

export default function InviteLandingScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const [landing, setLanding] = useState<InviteLanding | null>(null);
  const [dead, setDead] = useState(false);
  const [matched, setMatched] = useState<string | null>(null); // feud id after accept
  const [mySigil, setMySigil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (code == null || session == null) return;
    getInvite(supabase, code)
      .then((l) => (l.status === 'pending' ? setLanding(l) : setDead(true)))
      .catch(() => setDead(true));
    supabase.from('profiles').select('mask_avatar_id').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setMySigil(data?.mask_avatar_id ?? null));
  }, [code, session?.user.id]);

  async function accept() {
    if (code == null) return;
    setBusy(true);
    try {
      const feudId = await acceptInvite(supabase, code);
      setMatched(feudId);
    } catch {
      setDead(true);
    } finally {
      setBusy(false);
    }
  }

  if (matched != null && landing != null) {
    return (
      <MatchMoment
        mySigilId={mySigil}
        theirSigilId={landing.inviter_sigil}
        onDone={() => router.replace(`/feuds/${matched}`)}
      />
    );
  }

  if (dead) {
    return (
      <View style={styles.root}>
        <Text style={styles.deadText}>{t('landing.expired')}</Text>
        <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => router.replace('/')} />
      </View>
    );
  }

  if (landing == null) return <View style={styles.root} />;

  const glyph = SIGILS.find((s) => s.id === landing.inviter_sigil)?.glyph ?? '✠';
  return (
    <View style={styles.root}>
      <Text style={styles.sigil}>{glyph}</Text>
      <Text style={styles.title}>
        {t('summon.landingTitle', { name: landing.inviter_name })}
      </Text>
      <Text style={styles.terms}>
        {ordealLabel(landing.ordeal, i18n.language)}
        {landing.mode === 'showdown'
          ? ` — ${t('feud.modeShowdown', { goal: landing.goal_value })}`
          : ` — ${t('feud.modeEndless')}`}
      </Text>
      <GrimButton label={t('landing.accept')} onPress={accept} disabled={busy} />
      <GrimButton label={t('landing.decline')} variant="ghost" onPress={() => router.replace('/')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, justifyContent: 'center', padding: spacing[4], gap: spacing[3] },
  sigil: { fontSize: 56, color: colors.venom, textAlign: 'center' },
  title: { color: colors.bone, fontSize: 20, textAlign: 'center', letterSpacing: 1 },
  terms: { color: colors.ash, fontSize: 15, textAlign: 'center' },
  deadText: { color: colors.smoke, fontSize: 16, textAlign: 'center' },
});
