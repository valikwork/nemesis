import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Switch, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';
import { useSession } from '../src/auth/session';
import { getDeck, swipeRival, proposeFeud, type DeckCard, type DeckOrdeal } from '../src/lib/deck';
import { optIntoLocation, hasLocation } from '../src/lib/location';
import { notifyProfile } from '../src/lib/push';
import { ordealLabel } from '../src/onboarding/ordeal-labels';
import { SIGILS } from '../src/onboarding/sigils';
import { MatchMoment } from '../src/components/MatchMoment';
import { GrimButton } from '../src/components/GrimButton';
import { GrimInput } from '../src/components/GrimInput';
import { colors, radii, semantic, spacing } from '../src/theme/tokens';
import { errMessage } from '../src/lib/err';

type Gate = 'checking' | 'ask' | 'open';

export default function Deck() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id ?? '';
  const [mySigil, setMySigil] = useState<string | null>(null);

  const [gate, setGate] = useState<Gate>('checking');
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // post-match flow
  const [matched, setMatched] = useState<DeckCard | null>(null);
  const [termsFor, setTermsFor] = useState<DeckCard | null>(null);
  const [ordealId, setOrdealId] = useState<string | null>(null);
  const [showdown, setShowdown] = useState(false);
  const [goal, setGoal] = useState('');

  const load = useCallback(async () => {
    if (myId === '') return;
    try {
      setCards(await getDeck(supabase));
    } catch (e) {
      setError(errMessage(e));
    }
  }, [myId]);

  useEffect(() => {
    if (myId === '') return;
    (async () => {
      try {
        const { data } = await supabase.from('profiles').select('mask_avatar_id').eq('id', myId).single();
        setMySigil(data?.mask_avatar_id ?? null);
        if (await hasLocation(supabase, myId)) {
          setGate('open');
          await load();
        } else {
          setGate('ask');
        }
      } catch (e) {
        setError(errMessage(e));
      }
    })();
  }, [myId, load]);

  async function optIn() {
    setBusy(true);
    setError(null);
    try {
      if (await optIntoLocation(supabase, myId)) {
        setGate('open');
        await load();
      }
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verdict(card: DeckCard, liked: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { matched: hit } = await swipeRival(supabase, card.id, liked);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      if (hit) {
        notifyProfile(supabase, 'deck_match', card.id); // fire-and-forget
        setMatched(card);
      }
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const goalNum = Number(goal);
  const goalValid = !showdown || (Number.isFinite(goalNum) && goalNum > 0);

  async function throwGlove() {
    if (termsFor == null || ordealId == null || !goalValid) return;
    setBusy(true);
    setError(null);
    try {
      await proposeFeud(supabase, {
        targetId: termsFor.id, ordealId,
        mode: showdown ? 'showdown' : 'endless',
        goal: showdown ? goalNum : null,
      });
      setTermsFor(null);
      router.replace('/');
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const card = cards[0] ?? null;
  const glyph = (id: string) => SIGILS.find((s) => s.id === id)?.glyph ?? '✠';

  if (matched != null) {
    return (
      <MatchMoment
        mySigilId={mySigil}
        theirSigilId={matched.mask_avatar_id}
        onDone={() => {
          const m = matched;
          setMatched(null);
          setTermsFor(m);
          setOrdealId(m.shared_ordeals[0]?.id ?? null);
          setShowdown(false);
          setGoal('');
        }}
      />
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('deck.tab')}</Text>

      {gate === 'ask' && (
        <View style={styles.gate}>
          <Text style={styles.gateText}>{t('deck.locationAsk')}</Text>
          {error != null && <Text style={styles.error}>{error}</Text>}
          <GrimButton label={t('common.confirm')} onPress={optIn} disabled={busy} />
          <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
        </View>
      )}

      {gate === 'open' && card == null && (
        <View style={styles.gate}>
          <Text style={styles.gateText}>{t('deck.empty')}</Text>
          {error != null && <Text style={styles.error}>{error}</Text>}
          <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
        </View>
      )}

      {gate === 'open' && card != null && (
        <>
          <View style={styles.card}>
            <Text style={styles.cardSigil}>{glyph(card.mask_avatar_id)}</Text>
            <Text style={styles.cardName}>{card.nemesis_name}</Text>
            {card.catchphrase != null && <Text style={styles.cardPhrase}>“{card.catchphrase}”</Text>}
            <Text style={styles.cardDistance}>{t('deck.distanceAway', { km: card.distance_km })}</Text>
            <ScrollView style={styles.ordealScroll} contentContainerStyle={styles.ordealList}>
              {card.shared_ordeals.map((o: DeckOrdeal) => (
                <View key={o.id} style={styles.ordealChip}>
                  <Text style={styles.ordealName}>{ordealLabel(o, i18n.language)}</Text>
                  {o.skill_hint != null && <Text style={styles.ordealHint}>{o.skill_hint}</Text>}
                </View>
              ))}
              {card.bio != null && <Text style={styles.cardBio}>{card.bio}</Text>}
            </ScrollView>
          </View>
          {error != null && <Text style={styles.error}>{error}</Text>}
          <View style={styles.verdictRow}>
            <View style={styles.verdictBtn}>
              <GrimButton label={t('deck.spare')} variant="ghost" onPress={() => verdict(card, false)} disabled={busy} />
            </View>
            <View style={styles.verdictBtn}>
              <GrimButton label={t('deck.challenge')} onPress={() => verdict(card, true)} disabled={busy} />
            </View>
          </View>
        </>
      )}

      {gate === 'open' && <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />}

      <Modal visible={termsFor != null} transparent animationType="fade" onRequestClose={() => setTermsFor(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t('deck.throwGlove')}</Text>
            {termsFor?.shared_ordeals.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => setOrdealId(o.id)}
                style={[styles.pickRow, ordealId === o.id && styles.pickRowOn]}
              >
                <Text style={[styles.pickLabel, ordealId === o.id && styles.pickLabelOn]}>
                  {ordealLabel(o, i18n.language)}
                </Text>
              </Pressable>
            ))}
            <View style={styles.modeRow}>
              <Text style={styles.modeLabel}>
                {showdown ? t('feud.modeShowdown', { goal: goal || '…' }) : t('feud.modeEndless')}
              </Text>
              <Switch value={showdown} onValueChange={setShowdown}
                trackColor={{ false: colors.venomDim, true: colors.bloodDeep }} thumbColor={colors.bone} />
            </View>
            {showdown && <GrimInput value={goal} onChangeText={setGoal} placeholder="100" keyboardType="numeric" />}
            {error != null && <Text style={styles.error}>{error}</Text>}
            <GrimButton label={t('summon.create')} onPress={throwGlove} disabled={busy || ordealId == null || !goalValid} />
            <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => setTermsFor(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  title: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  gate: { flex: 1, justifyContent: 'center', gap: spacing[3] },
  gateText: { color: colors.ash, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  card: {
    flex: 1, backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.card, padding: spacing[4], alignItems: 'center', gap: spacing[2],
  },
  cardSigil: { fontSize: 72, color: colors.venom },
  cardName: { color: colors.bone, fontSize: 24, letterSpacing: 1, textAlign: 'center' },
  cardPhrase: { color: colors.ash, fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
  cardDistance: { color: colors.smoke, fontSize: 12, letterSpacing: 1 },
  ordealScroll: { alignSelf: 'stretch' },
  ordealList: { gap: spacing[1], paddingTop: spacing[2] },
  ordealChip: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.cryptRaised, borderRadius: radii.chip, padding: spacing[2],
  },
  ordealName: { color: colors.ash, fontSize: 14, flexShrink: 1 },
  ordealHint: { color: colors.venomDeep, fontSize: 12 },
  cardBio: { color: colors.smoke, fontSize: 13, marginTop: spacing[2], lineHeight: 19 },
  verdictRow: { flexDirection: 'row', gap: spacing[2] },
  verdictBtn: { flex: 1 },
  error: { color: colors.blood, fontSize: 13, textAlign: 'center' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.85)', justifyContent: 'center', padding: spacing[4] },
  modal: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[4], gap: spacing[2] },
  modalTitle: { color: colors.bone, fontSize: 20, textAlign: 'center', letterSpacing: 1 },
  pickRow: {
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.button, paddingVertical: spacing[2], paddingHorizontal: spacing[3],
  },
  pickRowOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  pickLabel: { color: colors.ash, fontSize: 15 },
  pickLabelOn: { color: colors.bone },
  modeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeLabel: { color: colors.ash, fontSize: 14 },
});
