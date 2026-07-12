import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { loadDraft, saveDraft } from '../../src/onboarding/draft';
import { ordealLabel, ordealUnit, type OrdealRow } from '../../src/onboarding/ordeal-labels';
import { validateOrdealName, validateOrdealUnit, validateSkillHint } from '../../src/lib/validation';
import { colors, radii, semantic, spacing } from '../../src/theme/tokens';

export default function OrdealsStep() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = i18n.language;
  const [rows, setRows] = useState<OrdealRow[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({}); // ordealId -> skillHint
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgeName, setForgeName] = useState('');
  const [forgeUnit, setForgeUnit] = useState('');
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [hintFor, setHintFor] = useState<string | null>(null);
  const [hintText, setHintText] = useState('');

  useEffect(() => {
    supabase.from('ordeals').select('*').order('name_en').then(({ data }) => setRows((data as OrdealRow[]) ?? []));
    loadDraft().then((d) => setSelected(Object.fromEntries(d.ordeals.map((o) => [o.ordealId, o.skillHint]))));
  }, []);

  function toggle(id: string) {
    if (selected[id] !== undefined) {
      const next = { ...selected };
      delete next[id];
      setSelected(next);
    } else {
      if (Object.keys(selected).length >= 5) return;
      setHintFor(id);
      setHintText('');
    }
  }

  function confirmHint() {
    if (hintFor == null || validateSkillHint(hintText) != null) return;
    // same cap as toggle(): confirming a hint for a not-yet-selected ordeal
    // (including one just forged) must not push the selection past 5
    if (selected[hintFor] === undefined && Object.keys(selected).length >= 5) {
      setHintFor(null);
      return;
    }
    setSelected({ ...selected, [hintFor]: hintText.trim() });
    setHintFor(null);
  }

  async function forge() {
    setForgeError(null);
    const { data, error } = await supabase.rpc('forge_ordeal', {
      p_name: forgeName.trim(), p_unit: forgeUnit.trim(), p_language: lang === 'uk' ? 'uk' : 'en',
    });
    if (error) {
      setForgeError(error.message.includes('ordeal_rejected') ? t('settings.ordealRejected') : error.message);
      return;
    }
    const row = data as OrdealRow;
    setRows([row, ...rows]);
    setForgeOpen(false);
    setForgeName('');
    setForgeUnit('');
    // freshly forged ordeal goes straight to the skill-hint sheet, so the
    // creator states their level immediately; confirming there selects it
    setHintFor(row.id);
    setHintText('');
  }

  async function next() {
    const draft = await loadDraft();
    await saveDraft({
      ...draft,
      ordeals: Object.entries(selected).map(([ordealId, skillHint]) => ({ ordealId, skillHint })),
    });
    router.push('/(onboarding)/finish');
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('onboarding.ordealsTitle')}</Text>
      <Text style={styles.subtitle}>{t('onboarding.ordealsSubtitle')}</Text>
      {Object.keys(selected).length >= 5 && (
        <Text style={styles.limitNote}>{t('onboarding.ordealsLimit')}</Text>
      )}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const on = selected[item.id] !== undefined;
          return (
            <Pressable onPress={() => toggle(item.id)} style={[styles.row, on && styles.rowOn]}>
              <Text style={[styles.rowLabel, on && styles.rowLabelOn]}>{ordealLabel(item, lang)}</Text>
              <Text style={styles.rowUnit}>
                {ordealUnit(item, lang)}{on && selected[item.id] ? ` · ${selected[item.id]}` : ''}
              </Text>
            </Pressable>
          );
        }}
      />
      <GrimButton label={t('onboarding.forgeCta')} variant="ghost" onPress={() => setForgeOpen(true)} />
      <GrimButton label={t('common.next')} onPress={next} disabled={Object.keys(selected).length === 0} />

      <Modal visible={forgeOpen} transparent animationType="fade" onRequestClose={() => setForgeOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t('onboarding.forgeCta')}</Text>
            <Text style={styles.fieldLabel}>{t('onboarding.forgeNameLabel')}</Text>
            <GrimInput value={forgeName} onChangeText={setForgeName} placeholder="Yodeling"
              error={forgeName !== '' && validateOrdealName(forgeName) ? t(`validation.${validateOrdealName(forgeName)}`) : null} />
            <Text style={styles.fieldLabel}>{t('onboarding.forgeUnitLabel')}</Text>
            <GrimInput value={forgeUnit} onChangeText={setForgeUnit} placeholder="yodels"
              error={forgeUnit !== '' && validateOrdealUnit(forgeUnit) ? t(`validation.${validateOrdealUnit(forgeUnit)}`) : null} />
            {forgeError != null && <Text style={styles.error}>{forgeError}</Text>}
            <GrimButton label={t('common.confirm')} onPress={forge}
              disabled={validateOrdealName(forgeName) != null || validateOrdealUnit(forgeUnit) != null} />
            <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => setForgeOpen(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={hintFor != null} transparent animationType="fade" onRequestClose={() => setHintFor(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t('onboarding.skillHintTitle')}</Text>
            <GrimInput value={hintText} onChangeText={setHintText} placeholder="1450"
              keyboardType="numeric"
              error={validateSkillHint(hintText) ? t(`validation.${validateSkillHint(hintText)}`) : null} />
            <GrimButton label={t('common.confirm')} onPress={confirmHint} disabled={validateSkillHint(hintText) != null} />
            <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => setHintFor(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  title: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  subtitle: { color: colors.ash, fontSize: 13, textAlign: 'center' },
  limitNote: { color: colors.smoke, fontSize: 12, textAlign: 'center' },
  fieldLabel: { color: colors.ash, fontSize: 12, letterSpacing: 1 },
  list: { gap: spacing[1] },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.button, paddingVertical: spacing[2], paddingHorizontal: spacing[3],
  },
  rowOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  rowLabel: { color: colors.ash, fontSize: 15 },
  rowLabelOn: { color: colors.bone },
  rowUnit: { color: colors.smoke, fontSize: 12 },
  error: { color: colors.blood, fontSize: 13 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.85)', justifyContent: 'center', padding: spacing[4] },
  modal: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[4], gap: spacing[2] },
});
