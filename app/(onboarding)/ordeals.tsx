import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { loadDraft, saveDraft } from '../../src/onboarding/draft';
import { ordealLabel, type OrdealRow } from '../../src/onboarding/ordeal-labels';
import { validateOrdealName, validateOrdealUnit } from '../../src/lib/validation';
import { colors, radii, semantic, spacing } from '../../src/theme/tokens';

// Ordeals are interests, not accomplishments (owner, 2026-07-12): no skill
// hint / prowess question anywhere — picking one is just "I beef about this".
export default function OrdealsStep() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = i18n.language;
  const [rows, setRows] = useState<OrdealRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgeName, setForgeName] = useState('');
  const [forgeUnit, setForgeUnit] = useState('');
  const [forgeAgg, setForgeAgg] = useState<'sum' | 'latest'>('sum');
  const [forgeError, setForgeError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('ordeals').select('*').order('name_en').then(({ data }) => setRows((data as OrdealRow[]) ?? []));
    loadDraft().then((d) => setSelected(new Set(d.ordeals.map((o) => o.ordealId))));
  }, []);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= 5) return;
      next.add(id);
    }
    setSelected(next);
  }

  async function forge() {
    setForgeError(null);
    const { data, error } = await supabase.rpc('forge_ordeal', {
      p_name: forgeName.trim(), p_unit: forgeUnit.trim(), p_language: lang === 'uk' ? 'uk' : 'en',
      p_aggregation: forgeAgg,
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
    setForgeAgg('sum');
    if (selected.size < 5) setSelected(new Set(selected).add(row.id));
  }

  async function next() {
    const draft = await loadDraft();
    await saveDraft({
      ...draft,
      ordeals: [...selected].map((ordealId) => ({ ordealId, skillHint: '' })),
    });
    router.push('/(onboarding)/finish');
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('onboarding.ordealsTitle')}</Text>
      <Text style={styles.subtitle}>{t('onboarding.ordealsSubtitle')}</Text>
      {selected.size >= 5 && (
        <Text style={styles.limitNote}>{t('onboarding.ordealsLimit')}</Text>
      )}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const on = selected.has(item.id);
          return (
            <Pressable onPress={() => toggle(item.id)} style={[styles.row, on && styles.rowOn]}>
              <Text style={[styles.rowLabel, on && styles.rowLabelOn]}>{ordealLabel(item, lang)}</Text>
            </Pressable>
          );
        }}
      />
      <GrimButton label={t('onboarding.forgeCta')} variant="ghost" onPress={() => setForgeOpen(true)} />
      <GrimButton label={t('common.next')} onPress={next} disabled={selected.size === 0} />

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
            <Text style={styles.fieldLabel}>{t('onboarding.forgeAggLabel')}</Text>
            {(['sum', 'latest'] as const).map((agg) => (
              <Pressable key={agg} onPress={() => setForgeAgg(agg)}
                style={[styles.aggRow, forgeAgg === agg && styles.aggRowOn]}>
                <Text style={[styles.aggLabel, forgeAgg === agg && styles.aggLabelOn]}>
                  {t(agg === 'sum' ? 'onboarding.aggSum' : 'onboarding.aggLatest')}
                </Text>
              </Pressable>
            ))}
            {forgeError != null && <Text style={styles.error}>{forgeError}</Text>}
            <GrimButton label={t('common.confirm')} onPress={forge}
              disabled={validateOrdealName(forgeName) != null || validateOrdealUnit(forgeUnit) != null} />
            <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => setForgeOpen(false)} />
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
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.button, paddingVertical: spacing[2], paddingHorizontal: spacing[3],
  },
  rowOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  rowLabel: { color: colors.ash, fontSize: 15 },
  rowLabelOn: { color: colors.bone },
  error: { color: colors.blood, fontSize: 13 },
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
