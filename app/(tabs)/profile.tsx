import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { useSession } from '../../src/auth/session';
import { ordealLabel, type OrdealRow } from '../../src/onboarding/ordeal-labels';
import { SIGILS } from '../../src/onboarding/sigils';
import { validateOrdealName, validateOrdealUnit, validateCatchphrase, validateBio } from '../../src/lib/validation';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { BrutalText } from '../../src/components/BrutalText';
import { useBrutality } from '../../src/theme/brutality-context';
import { SigilDivider } from '../../src/components/SigilDivider';
import { errMessage } from '../../src/lib/err';
import { colors, radii, semantic, spacing } from '../../src/theme/tokens';

// Ordeals are interests (owner, 2026-07-12): things you beef about, not an
// accomplishments list. Add/remove like Tinder interests, cap 5.
export default function Profile() {
  const { t, i18n } = useTranslation();
  const { session } = useSession();
  const { font } = useBrutality();
  const body = { fontFamily: font('body') };
  const label = { fontFamily: font('label') };
  const uid = session?.user.id;
  const lang = i18n.language;

  const [persona, setPersona] = useState<{ nemesis_name: string; mask_avatar_id: string } | null>(null);
  const [catchphrase, setCatchphrase] = useState('');
  const [bio, setBio] = useState('');
  const [saved, setSaved] = useState(false);
  const [mine, setMine] = useState<OrdealRow[]>([]);
  const [catalog, setCatalog] = useState<OrdealRow[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgeName, setForgeName] = useState('');
  const [forgeUnit, setForgeUnit] = useState('');
  const [forgeAgg, setForgeAgg] = useState<'sum' | 'latest'>('sum');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (uid == null) return;
    const [{ data: p }, { data: po }, { data: all }] = await Promise.all([
      supabase.from('profiles').select('nemesis_name, catchphrase, bio, mask_avatar_id').eq('id', uid).maybeSingle(),
      supabase.from('profile_ordeals').select('ordeal:ordeals(*)').eq('profile_id', uid),
      supabase.from('ordeals').select('*').eq('moderation_status', 'approved').order('name_en'),
    ]);
    setPersona(p ?? null);
    setCatchphrase(p?.catchphrase ?? '');
    setBio(p?.bio ?? '');
    setMine(((po ?? []) as any[]).map((r) => r.ordeal as OrdealRow));
    setCatalog((all ?? []) as OrdealRow[]);
  }, [uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add(ordealId: string) {
    if (uid == null || mine.length >= 5) return;
    setError(null);
    try {
      const { error: e } = await supabase.from('profile_ordeals').insert({ profile_id: uid, ordeal_id: ordealId });
      if (e) throw e;
      await load();
    } catch (e) {
      setError(errMessage(e));
    }
  }

  async function remove(ordealId: string) {
    if (uid == null) return;
    setError(null);
    try {
      const { error: e } = await supabase.from('profile_ordeals').delete()
        .eq('profile_id', uid).eq('ordeal_id', ordealId);
      if (e) throw e;
      await load();
    } catch (e) {
      setError(errMessage(e));
    }
  }

  async function savePersona() {
    if (uid == null) return;
    setError(null);
    try {
      const { error: e } = await supabase.from('profiles').update({
        catchphrase: catchphrase.trim() || null,
        bio: bio.trim() || null,
      }).eq('id', uid);
      if (e) throw e;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(errMessage(e));
    }
  }

  async function forge() {
    setError(null);
    const { data, error: fe } = await supabase.rpc('forge_ordeal', {
      p_name: forgeName.trim(), p_unit: forgeUnit.trim(), p_language: lang === 'uk' ? 'uk' : 'en',
      p_aggregation: forgeAgg,
    });
    if (fe) {
      setError(fe.message.includes('ordeal_rejected') ? t('settings.ordealRejected') : fe.message);
      return;
    }
    setForgeOpen(false);
    setForgeName('');
    setForgeUnit('');
    setForgeAgg('sum');
    await add((data as OrdealRow).id);
  }

  const glyph = SIGILS.find((s) => s.id === persona?.mask_avatar_id)?.glyph ?? '✠';
  const available = catalog.filter((o) => !mine.some((m) => m.id === o.id));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.root}>
      <Text style={styles.sigil}>{glyph}</Text>
      {persona != null && <BrutalText text={persona.nemesis_name} font={font('display')} style={styles.name} />}

      <Text style={[styles.section, label]}>{t('settings.persona')}</Text>
      <Text style={[styles.fieldLabel, body]}>{t('onboarding.catchphraseTitle')}</Text>
      <GrimInput value={catchphrase} onChangeText={setCatchphrase}
        placeholder={t('onboarding.catchphrasePlaceholder')}
        error={validateCatchphrase(catchphrase) ? t(`validation.${validateCatchphrase(catchphrase)}`) : null} />
      <Text style={[styles.fieldLabel, body]}>{t('onboarding.bioTitle')}</Text>
      <GrimInput value={bio} onChangeText={setBio} multiline numberOfLines={3}
        placeholder="…"
        error={validateBio(bio) ? t(`validation.${validateBio(bio)}`) : null} />
      {saved && <Text style={[styles.hint, body]}>{t('settings.saved')}</Text>}
      <GrimButton label={t('settings.save')} onPress={savePersona}
        disabled={validateCatchphrase(catchphrase) != null || validateBio(bio) != null} />

      <SigilDivider />
      <Text style={[styles.section, label]}>{t('profile.ordealsTitle')}</Text>
      <Text style={[styles.hint, body]}>{t('profile.ordealsHint')}</Text>
      {error != null && <Text style={[styles.error, body]}>{error}</Text>}
      <View style={styles.list}>
        {mine.map((item) => (
          <View key={item.id} style={styles.row}>
            <Text style={[styles.rowLabel, body]}>{ordealLabel(item, lang)}</Text>
            <Pressable onPress={() => remove(item.id)} hitSlop={8}>
              <Text style={styles.removeX}>✕</Text>
            </Pressable>
          </View>
        ))}
        {mine.length === 0 && <Text style={[styles.hint, body]}>{t('profile.ordealsEmpty')}</Text>}
      </View>
      {mine.length >= 5 && <Text style={[styles.hint, body]}>{t('onboarding.ordealsLimit')}</Text>}
      <GrimButton label={t('profile.addOrdeal')} onPress={() => setPickOpen(true)} disabled={mine.length >= 5} />
      <GrimButton label={t('onboarding.forgeCta')} variant="ghost" onPress={() => setForgeOpen(true)} disabled={mine.length >= 5} />

      <Modal visible={pickOpen} transparent animationType="fade" onRequestClose={() => setPickOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={[styles.section, label]}>{t('profile.addOrdeal')}</Text>
            <ScrollView style={styles.pickScroll} contentContainerStyle={styles.list}>
              {available.map((o) => (
                <Pressable key={o.id} style={styles.row}
                  onPress={async () => { await add(o.id); setPickOpen(false); }}>
                  <Text style={styles.rowLabel}>{ordealLabel(o, lang)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => setPickOpen(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={forgeOpen} transparent animationType="fade" onRequestClose={() => setForgeOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={[styles.section, label]}>{t('onboarding.forgeCta')}</Text>
            <Text style={[styles.fieldLabel, body]}>{t('onboarding.forgeNameLabel')}</Text>
            <GrimInput value={forgeName} onChangeText={setForgeName} placeholder="Yodeling"
              error={forgeName !== '' && validateOrdealName(forgeName) ? t(`validation.${validateOrdealName(forgeName)}`) : null} />
            <Text style={[styles.fieldLabel, body]}>{t('onboarding.forgeUnitLabel')}</Text>
            <GrimInput value={forgeUnit} onChangeText={setForgeUnit} placeholder="yodels"
              error={forgeUnit !== '' && validateOrdealUnit(forgeUnit) ? t(`validation.${validateOrdealUnit(forgeUnit)}`) : null} />
            <Text style={[styles.fieldLabel, body]}>{t('onboarding.forgeAggLabel')}</Text>
            {(['sum', 'latest'] as const).map((agg) => (
              <Pressable key={agg} onPress={() => setForgeAgg(agg)}
                style={[styles.aggRow, forgeAgg === agg && styles.aggRowOn]}>
                <Text style={[styles.aggLabel, body, forgeAgg === agg && styles.aggLabelOn]}>
                  {t(agg === 'sum' ? 'onboarding.aggSum' : 'onboarding.aggLatest')}
                </Text>
              </Pressable>
            ))}
            {error != null && <Text style={[styles.error, body]}>{error}</Text>}
            <GrimButton label={t('common.confirm')} onPress={forge}
              disabled={validateOrdealName(forgeName) != null || validateOrdealUnit(forgeUnit) != null} />
            <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => setForgeOpen(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.bg },
  root: { padding: spacing[4], paddingTop: spacing[5] * 2, paddingBottom: spacing[5], gap: spacing[2] },
  sigil: { fontSize: 56, color: colors.venom, textAlign: 'center' },
  name: { color: colors.bone, fontSize: 24, textAlign: 'center', letterSpacing: 1 },
  phrase: { color: colors.ash, fontSize: 13, fontStyle: 'italic', textAlign: 'center' },
  section: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: spacing[3], textAlign: 'center' },
  hint: { color: colors.smoke, fontSize: 12, textAlign: 'center' },
  fieldLabel: { color: colors.ash, fontSize: 12, letterSpacing: 1 },
  list: { gap: spacing[1] },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.button, paddingVertical: spacing[2], paddingHorizontal: spacing[3],
  },
  rowLabel: { color: colors.bone, fontSize: 15, flexShrink: 1 },
  removeX: { color: colors.blood, fontSize: 16 },
  error: { color: colors.blood, fontSize: 13, textAlign: 'center' },
  pickScroll: { maxHeight: 380 },
  aggRow: {
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.button, paddingVertical: spacing[2], paddingHorizontal: spacing[3],
  },
  aggRowOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  aggLabel: { color: colors.ash, fontSize: 14 },
  aggLabelOn: { color: colors.bone },
  modalScrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.85)', justifyContent: 'center', padding: spacing[4] },
  modal: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[4], gap: spacing[2] },
});
