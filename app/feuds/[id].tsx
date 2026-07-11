import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Modal, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../src/lib/supabase';
import { useSession } from '../../src/auth/session';
import { listScores, logScore, type FeudRow, type ScoreEntry } from '../../src/lib/feuds';
import { ordealLabel, ordealUnit, type OrdealRow } from '../../src/onboarding/ordeal-labels';
import { TowerRace } from '../../src/components/TowerRace';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { colors, radii, semantic, spacing } from '../../src/theme/tokens';

export default function FeudScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id ?? '';

  const [feud, setFeud] = useState<FeudRow | null>(null);
  const [ordeal, setOrdeal] = useState<OrdealRow | null>(null);
  const [opponentName, setOpponentName] = useState('');
  const [entries, setEntries] = useState<ScoreEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (id == null || myId === '') return;
    const { data: f } = await supabase.from('feuds').select('*').eq('id', id).maybeSingle();
    if (f == null) { router.replace('/'); return; }
    setFeud(f as FeudRow);
    const opponentId = f.profile_a === myId ? f.profile_b : f.profile_a;
    const [{ data: o }, { data: p }, scores] = await Promise.all([
      supabase.from('ordeals').select('*').eq('id', f.ordeal_id).single(),
      supabase.from('profiles').select('nemesis_name').eq('id', opponentId).maybeSingle(),
      listScores(supabase, id),
    ]);
    setOrdeal(o as OrdealRow);
    setOpponentName(p?.nemesis_name ?? '???');
    setEntries(scores);
  }, [id, myId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (id == null) return;
    const channel = supabase
      .channel(`feud:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'score_entries', filter: `feud_id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'feuds', filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, load]);

  async function pickProof() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!res.canceled && res.assets[0] != null) setProofUri(res.assets[0].uri);
  }

  async function submit() {
    if (feud == null) return;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) { setError(t('validation.tooShort')); return; }
    setBusy(true);
    setError(null);
    try {
      let proofUrl: string | undefined;
      if (proofUri != null) {
        const path = `${feud.id}/${Date.now()}.jpg`;
        const resp = await fetch(proofUri);
        const blob = await resp.arrayBuffer();
        const { error: upErr } = await supabase.storage.from('proofs').upload(path, blob, { contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        proofUrl = path;
      }
      await logScore(supabase, { feudId: feud.id, value: num, note, proofUrl });
      setLogOpen(false);
      setValue(''); setNote(''); setProofUri(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (feud == null || ordeal == null) return <View style={styles.root} />;

  const unit = ordealUnit(ordeal, i18n.language);
  const opponentId = feud.profile_a === myId ? feud.profile_b : feud.profile_a;
  const ended = feud.status === 'ended';
  const iWon = ended && feud.winner === myId;
  const myEntries = entries.filter((e) => e.author === myId);
  const rumorCount = myEntries.filter((e) => e.proof_url == null).length;
  const rumorPct = myEntries.length > 0 ? Math.round((rumorCount / myEntries.length) * 100) : 0;

  return (
    <View style={styles.root}>
      <Text style={styles.header}>{opponentName}</Text>
      <Text style={styles.subheader}>{ordealLabel(ordeal, i18n.language)}</Text>
      {ended && (
        <View style={styles.verdict}>
          <Text style={[styles.verdictText, iWon ? styles.won : styles.lost]}>
            {iWon ? t('feud.won') : t('feud.lost')}
          </Text>
          {iWon && rumorPct > 0 && (
            <Text style={styles.rumorRatio}>{t('feud.victoryRumorRatio', { pct: rumorPct })}</Text>
          )}
        </View>
      )}
      <TowerRace
        mode={feud.mode}
        goal={feud.goal_value}
        myId={myId}
        them={opponentId}
        entries={entries.map((e) => ({ author: e.author, value: Number(e.value), chronicled: e.proof_url != null }))}
        myName={t('feud.you')}
        theirName={opponentName}
        unit={unit}
      />
      {!ended && <GrimButton label={t('feud.logDeed')} onPress={() => setLogOpen(true)} />}
      <Text style={styles.chronicleTitle}>{t('feud.chronicle')}</Text>
      <FlatList
        data={[...entries].reverse()}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.chronicle}
        renderItem={({ item }) => {
          const mine = item.author === myId;
          const rumor = item.proof_url == null;
          return (
            <View style={[styles.entry, rumor && styles.entryRumor]}>
              <Text style={[styles.entryWho, mine ? styles.entryMine : styles.entryTheirs]}>
                {mine ? t('feud.you') : opponentName}
              </Text>
              <Text style={styles.entryValue}>
                +{Number(item.value)} {unit}{rumor ? ` · ${t('feud.entryRumor')}` : ''}
              </Text>
              {item.note != null && <Text style={styles.entryNote}>{item.note}</Text>}
            </View>
          );
        }}
      />
      <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />

      <Modal visible={logOpen} transparent animationType="fade" onRequestClose={() => setLogOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={styles.header}>{t('feud.logTitle')}</Text>
            <Text style={styles.fieldLabel}>{t('feud.valueLabel')} ({unit})</Text>
            <GrimInput value={value} onChangeText={setValue} placeholder="5" keyboardType="numeric" />
            <Text style={styles.fieldLabel}>{t('feud.noteLabel')}</Text>
            <GrimInput value={note} onChangeText={setNote} placeholder="…" />
            <Pressable onPress={pickProof}>
              <Text style={styles.proofCta}>
                {proofUri != null ? t('feud.proofAttached') : t('feud.attachProof')}
              </Text>
            </Pressable>
            <Text style={styles.proofHint}>{t('feud.proofHint')}</Text>
            {error != null && <Text style={styles.error}>{error}</Text>}
            <GrimButton label={t('common.confirm')} onPress={submit} disabled={busy} />
            <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => setLogOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[1] },
  header: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  subheader: { color: colors.smoke, fontSize: 13, textAlign: 'center' },
  verdict: { alignItems: 'center', marginVertical: spacing[1] },
  verdictText: { fontSize: 28, letterSpacing: 4 },
  won: { color: colors.blood },
  lost: { color: colors.smoke },
  rumorRatio: { color: colors.venomDeep, fontSize: 12, marginTop: 2 },
  chronicleTitle: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: spacing[2] },
  chronicle: { gap: spacing[1] },
  entry: {
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.chip, padding: spacing[2],
  },
  entryRumor: { opacity: 0.7, borderStyle: 'dashed' },
  entryWho: { fontSize: 11, letterSpacing: 1 },
  entryMine: { color: colors.blood },
  entryTheirs: { color: colors.venomDeep },
  entryValue: { color: colors.bone, fontSize: 14 },
  entryNote: { color: colors.ash, fontSize: 12, fontStyle: 'italic' },
  fieldLabel: { color: colors.ash, fontSize: 12, letterSpacing: 1 },
  proofCta: { color: colors.venom, fontSize: 13 },
  proofHint: { color: colors.smoke, fontSize: 11 },
  error: { color: colors.blood, fontSize: 13 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.85)', justifyContent: 'center', padding: spacing[4] },
  modal: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[4], gap: spacing[2] },
});
