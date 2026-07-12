import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Modal, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../src/lib/supabase';
import { useSession } from '../../src/auth/session';
import { listScores, logScore, type FeudRow, type ScoreEntry } from '../../src/lib/feuds';
import { declareArch, dissolveArch } from '../../src/lib/deck';
import { notifyOpponent, notifyProfile } from '../../src/lib/push';
import {
  listTaunts, assembleTaunt, fetchTemplateWithBanks,
  type TauntRow, type TauntTemplate, type TauntBankWord,
} from '../../src/lib/taunts';
import { ordealLabel, ordealUnit, type OrdealRow } from '../../src/onboarding/ordeal-labels';
import { TowerRace } from '../../src/components/TowerRace';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { TauntForgeSheet } from '../../src/components/TauntForgeSheet';
import { SafetySheet } from '../../src/components/SafetySheet';
import { colors, radii, semantic, spacing } from '../../src/theme/tokens';
import { errMessage } from '../../src/lib/err';

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
  const [forgeOpen, setForgeOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [archConfirm, setArchConfirm] = useState<'declare' | 'dissolve' | null>(null);
  const [archNote, setArchNote] = useState<string | null>(null);
  const [realName, setRealName] = useState<string | null>(null);
  const [taunts, setTaunts] = useState<TauntRow[]>([]);
  const [tauntKits, setTauntKits] = useState<Map<string, { template: TauntTemplate; banks: TauntBankWord[] }>>(new Map());

  const load = useCallback(async () => {
    if (id == null || myId === '') return;
    const { data: f } = await supabase.from('feuds').select('*').eq('id', id).maybeSingle();
    if (f == null) { router.replace('/'); return; }
    setFeud(f as FeudRow);
    const opponentId = f.profile_a === myId ? f.profile_b : f.profile_a;
    const [{ data: o }, { data: p }, scores, tauntRows] = await Promise.all([
      supabase.from('ordeals').select('*').eq('id', f.ordeal_id).single(),
      supabase.from('profiles').select('nemesis_name').eq('id', opponentId).maybeSingle(),
      listScores(supabase, id),
      listTaunts(supabase, id),
    ]);
    setOrdeal(o as OrdealRow);
    setOpponentName(p?.nemesis_name ?? '???');
    if (f.is_arch && f.unmasked_at != null && f.status === 'active') {
      // readable only during an active unmasked pact (unmask_pact policy)
      const { data: um } = await supabase.from('unmasked_identities')
        .select('real_name').eq('profile_id', opponentId).maybeSingle();
      setRealName(um?.real_name ?? null);
    } else {
      setRealName(null);
    }
    setEntries(scores);
    setTaunts(tauntRows);
    setTauntKits((prev) => {
      const missing = tauntRows.filter((tr) => !prev.has(tr.template_id));
      if (missing.length === 0) return prev;
      const next = new Map(prev);
      Promise.all(
        missing.map((tr) => fetchTemplateWithBanks(supabase, tr.template_id).then((kit) => { next.set(tr.template_id, kit); })),
      ).then(() => setTauntKits(new Map(next)));
      return prev;
    });
  }, [id, myId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (id == null) return;
    const channel = supabase
      .channel(`feud:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'score_entries', filter: `feud_id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'feuds', filter: `id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taunts', filter: `feud_id=eq.${id}` }, () => load())
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
      notifyOpponent(supabase, 'score', feud.id); // fire-and-forget
      setLogOpen(false);
      setValue(''); setNote(''); setProofUri(null);
      await load();
    } catch (e) {
      setError(errMessage(e));
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
      <Pressable style={styles.safetyMenu} onPress={() => setSafetyOpen(true)}>
        <Text style={styles.safetyMenuText}>{t('safety.menu')}</Text>
      </Pressable>
      <Text style={styles.header}>{opponentName}</Text>
      {feud.is_arch && (
        <Text style={styles.archBadge}>
          ⚜ {t('arch.title')}{realName != null ? ` · ${realName}` : ''}
        </Text>
      )}
      <Text style={styles.subheader}>{ordealLabel(ordeal, i18n.language)}</Text>
      {archNote != null && <Text style={styles.archNote}>{archNote}</Text>}
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
      {!ended && <GrimButton label={t('forge.cta')} variant="ghost" onPress={() => setForgeOpen(true)} />}
      {!ended && !feud.is_arch && feud.status === 'active' && (
        <GrimButton label={t('arch.declareCta')} variant="ghost" onPress={() => setArchConfirm('declare')} />
      )}
      {feud.is_arch && feud.status === 'active' && (
        <GrimButton label={t('arch.dissolveCta')} variant="ghost" onPress={() => setArchConfirm('dissolve')} />
      )}
      {taunts.length > 0 && (
        <>
          <Text style={styles.chronicleTitle}>{t('forge.missives')}</Text>
          <View style={styles.missives}>
            {taunts.slice(0, 5).map((tr) => {
              const kit = tauntKits.get(tr.template_id);
              const mine = tr.author === myId;
              return (
                <Text
                  key={tr.id}
                  style={[styles.missive, mine ? styles.missiveMine : styles.missiveTheirs]}
                >
                  {kit != null ? assembleTaunt(kit.template, kit.banks, tr.picks) : '…'}
                </Text>
              );
            })}
          </View>
        </>
      )}
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

      <TauntForgeSheet
        feudId={feud.id}
        visible={forgeOpen}
        onClose={() => setForgeOpen(false)}
        onSent={() => { notifyOpponent(supabase, 'taunt', feud.id); load(); }}
      />

      <Modal visible={archConfirm != null} transparent animationType="fade" onRequestClose={() => setArchConfirm(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={styles.header}>
              {archConfirm === 'declare' ? t('arch.confirmTitle') : t('arch.title')}
            </Text>
            <Text style={styles.archBody}>
              {archConfirm === 'declare' ? t('arch.confirmBody') : t('arch.dissolveConfirm')}
            </Text>
            {error != null && <Text style={styles.error}>{error}</Text>}
            <GrimButton
              label={t('common.confirm')}
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                setError(null);
                try {
                  if (archConfirm === 'declare') {
                    await declareArch(supabase, opponentId);
                    notifyProfile(supabase, 'declare', opponentId); // fire-and-forget
                    setArchNote(t('arch.declared'));
                  } else {
                    await dissolveArch(supabase, feud.id);
                    router.replace('/');
                    return;
                  }
                  setArchConfirm(null);
                } catch (e) {
                  setError(errMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
            <GrimButton label={t('common.cancel')} variant="ghost"
              onPress={() => { setArchConfirm(null); setError(null); }} />
          </View>
        </View>
      </Modal>

      <SafetySheet
        visible={safetyOpen}
        targetId={opponentId}
        targetName={opponentName}
        feudId={feud.id}
        onClose={() => setSafetyOpen(false)}
        onBlocked={() => router.replace('/')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[1] },
  safetyMenu: { position: 'absolute', top: spacing[5] * 1.5, right: spacing[4] },
  safetyMenuText: { color: colors.smoke, fontSize: 22 },
  header: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  subheader: { color: colors.smoke, fontSize: 13, textAlign: 'center' },
  archBadge: { color: colors.blood, fontSize: 13, letterSpacing: 2, textAlign: 'center' },
  archNote: { color: colors.venomDeep, fontSize: 12, textAlign: 'center' },
  archBody: { color: colors.ash, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  verdict: { alignItems: 'center', marginVertical: spacing[1] },
  verdictText: { fontSize: 28, letterSpacing: 4 },
  won: { color: colors.blood },
  lost: { color: colors.smoke },
  rumorRatio: { color: colors.venomDeep, fontSize: 12, marginTop: 2 },
  chronicleTitle: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: spacing[2] },
  missives: { gap: spacing[0] },
  missive: { fontSize: 12, fontStyle: 'italic' },
  missiveMine: { color: colors.blood, textAlign: 'right' },
  missiveTheirs: { color: colors.venomDeep, textAlign: 'left' },
  chronicle: { gap: spacing[1] },
  entry: {
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.chip, padding: spacing[2],
  },
  entryRumor: { opacity: 0.7, borderColor: colors.venomDeep },
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
