import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { useSession } from '../../src/auth/session';
import { listFeudsWithMeta, type FeudWithMeta } from '../../src/lib/feuds';
import { respondFeud, resolveDeclare, myDeclares, myMatches, proposeFeud, type DeclareRow, type MatchCard } from '../../src/lib/deck';
import { notifyOpponent } from '../../src/lib/push';
import { SIGILS } from '../../src/onboarding/sigils';
import { FeudRowCard } from '../../src/components/FeudRowCard';
import { GloveSheet } from '../../src/components/GloveSheet';
import { BrutalText } from '../../src/components/BrutalText';
import { colors, radii, semantic, spacing } from '../../src/theme/tokens';
import { useBrutality } from '../../src/theme/brutality-context';
import { SigilDivider } from '../../src/components/SigilDivider';
import { errMessage } from '../../src/lib/err';

interface DeclareBanner extends DeclareRow {
  declarer_name: string;
}

export default function Home() {
  const { t } = useTranslation();
  const { session } = useSession();
  const { font } = useBrutality();
  const body = { fontFamily: font('body') };
  const router = useRouter();
  const [feuds, setFeuds] = useState<FeudWithMeta[]>([]);
  const [declares, setDeclares] = useState<DeclareBanner[]>([]);
  const [matches, setMatches] = useState<MatchCard[]>([]);
  const [gloveFor, setGloveFor] = useState<MatchCard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (session == null) return;
    setRefreshing(true);
    try {
      const [feudRows, declareRows, matchRows] = await Promise.all([
        listFeudsWithMeta(supabase, session.user.id),
        myDeclares(supabase),
        myMatches(supabase),
      ]);
      setFeuds(feudRows);
      setMatches(matchRows);
      const incoming = declareRows.filter((d) => d.status === 'pending' && d.target === session.user.id);
      const names = new Map<string, string>();
      if (incoming.length > 0) {
        const { data } = await supabase.from('profiles').select('id, nemesis_name')
          .in('id', incoming.map((d) => d.declarer));
        for (const p of data ?? []) names.set(p.id, p.nemesis_name);
      }
      setDeclares(incoming.map((d) => ({ ...d, declarer_name: names.get(d.declarer) ?? '???' })));
    } finally {
      setRefreshing(false);
    }
  }, [session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const myId = session?.user.id ?? '';
  const active = feuds.filter((f) => f.feud.status === 'active');
  const proposed = feuds.filter((f) => f.feud.status === 'proposed');
  const buried = feuds.filter((f) => f.feud.status === 'ended' || f.feud.status === 'dissolved');

  async function answerGauntlet(feudId: string, accept: boolean) {
    setError(null);
    try {
      await respondFeud(supabase, feudId, accept);
      if (accept) notifyOpponent(supabase, 'match', feudId); // fire-and-forget
      await load();
    } catch (e) {
      setError(errMessage(e));
    }
  }

  async function throwGlove(args: { ordealId: string; mode: 'endless' | 'showdown'; goal: number | null }) {
    if (gloveFor == null) return;
    setBusy(true);
    setError(null);
    try {
      await proposeFeud(supabase, { targetId: gloveFor.id, ...args });
      setGloveFor(null);
      await load();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function answerDeclare(declareId: string, accept: boolean) {
    setError(null);
    try {
      await resolveDeclare(supabase, declareId, accept);
      await load();
    } catch (e) {
      setError(errMessage(e));
    }
  }

  return (
    <View style={styles.root}>
      <BrutalText text="NEMESIS" font={font('logo')} style={styles.logo} />
      <BrutalText text={t('home.title')} font={font('display')} style={styles.title} />
      {error != null && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={active}
        keyExtractor={(f) => f.feud.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.blood} />}
        renderItem={({ item }) => (
          <FeudRowCard item={item} onPress={() => router.push(`/feuds/${item.feud.id}`)} />
        )}
        ListHeaderComponent={
          <>
            {declares.map((d) => (
              <View key={d.id} style={styles.banner}>
                <Text style={[styles.bannerText, body]}>{t('arch.received', { name: d.declarer_name })}</Text>
                <View style={styles.bannerRow}>
                  <Pressable onPress={() => answerDeclare(d.id, false)}>
                    <Text style={styles.bannerDecline}>{t('landing.decline')}</Text>
                  </Pressable>
                  <Pressable onPress={() => answerDeclare(d.id, true)}>
                    <Text style={styles.bannerAccept}>{t('landing.accept')}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {matches.map((m) => (
              <View key={m.id} style={styles.banner}>
                <Text style={[styles.bannerText, body]}>
                  {SIGILS.find((s) => s.id === m.mask_avatar_id)?.glyph ?? '✠'} {m.nemesis_name} · {t('deck.matchTitle')}
                </Text>
                <View style={styles.bannerRow}>
                  <Pressable onPress={() => setGloveFor(m)}>
                    <Text style={styles.bannerAccept}>{t('deck.matchCta')}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {proposed.length > 0 && (
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionTitle}>{t('home.gauntletTitle')}</Text>
                {proposed.map((item) => {
                  const mine = item.feud.proposed_by === myId;
                  return (
                    <View key={item.feud.id} style={styles.gauntlet}>
                      <FeudRowCard item={item} onPress={() => {}} />
                      {mine ? (
                        <Text style={styles.gauntletAwait}>
                          {t('home.gauntletAwait', { name: item.opponent.nemesis_name })}
                        </Text>
                      ) : (
                        <View style={styles.bannerRow}>
                          <Pressable onPress={() => answerGauntlet(item.feud.id, false)}>
                            <Text style={styles.bannerDecline}>{t('landing.decline')}</Text>
                          </Pressable>
                          <Pressable onPress={() => answerGauntlet(item.feud.id, true)}>
                            <Text style={styles.bannerAccept}>{t('landing.accept')}</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          proposed.length === 0 && declares.length === 0 && matches.length === 0
            ? <Text style={[styles.empty, body]}>{t('home.empty')}</Text>
            : null
        }
        ListFooterComponent={
          buried.length > 0 ? (
            <View style={styles.buriedWrap}>
              <SigilDivider />
              <Text style={styles.buriedTitle}>{t('home.buried')}</Text>
              {buried.map((item) => (
                <FeudRowCard key={item.feud.id} item={item} onPress={() => router.push(`/feuds/${item.feud.id}`)} />
              ))}
            </View>
          ) : null
        }
      />
      <GloveSheet
        visible={gloveFor != null}
        sharedOrdeals={gloveFor?.shared_ordeals ?? []}
        busy={busy}
        error={error}
        onThrow={throwGlove}
        onClose={() => setGloveFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  logo: { color: semantic.text, fontSize: 30, letterSpacing: 5, textAlign: 'center' },
  title: { color: colors.venomDeep, fontSize: 13, letterSpacing: 2, textAlign: 'center', marginBottom: spacing[2] },
  list: { gap: spacing[2], flexGrow: 1 },
  empty: { color: colors.smoke, fontSize: 14, textAlign: 'center', marginTop: spacing[5] },
  error: { color: colors.blood, fontSize: 13, textAlign: 'center' },
  banner: {
    backgroundColor: colors.bloodMist, borderWidth: 1, borderColor: colors.blood,
    borderRadius: radii.card, padding: spacing[3], gap: spacing[2],
  },
  bannerText: { color: colors.bone, fontSize: 14, lineHeight: 20 },
  bannerRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[4] },
  bannerAccept: { color: colors.blood, fontSize: 14, letterSpacing: 1 },
  bannerDecline: { color: colors.smoke, fontSize: 14 },
  sectionWrap: { gap: spacing[2] },
  sectionTitle: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  gauntlet: { gap: spacing[1] },
  gauntletAwait: { color: colors.venomDeep, fontSize: 12, textAlign: 'right' },
  buriedWrap: { marginTop: spacing[4], gap: spacing[2] },
  buriedTitle: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
});
