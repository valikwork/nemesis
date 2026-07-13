import { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { fetchTauntKit, assembleTaunt, sendTaunt, type TauntTemplate, type TauntBankWord } from '../lib/taunts';
import { GrimButton } from './GrimButton';
import { colors, radii, spacing } from '../theme/tokens';
import { useBrutality } from '../theme/brutality-context';
import { BrutalText } from './BrutalText';
import { errMessage } from '../lib/err';

interface Props {
  feudId: string;
  visible: boolean;
  onClose: () => void;
  onSent: () => void;
}

export function TauntForgeSheet({ feudId, visible, onClose, onSent }: Props) {
  const { t, i18n } = useTranslation();
  const { font } = useBrutality();
  const body = { fontFamily: font('body') };
  const [template, setTemplate] = useState<TauntTemplate | null>(null);
  const [bySlot, setBySlot] = useState<TauntBankWord[][]>([]);
  const [banks, setBanks] = useState<TauntBankWord[]>([]);
  const [picks, setPicks] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    fetchTauntKit(supabase, i18n.language).then(({ template, banks, bySlot }) => {
      setTemplate(template);
      setBanks(banks);
      setBySlot(bySlot);
      setPicks(new Array(template.slot_count).fill(0));
      setError(null);
    });
  }, [visible, i18n.language]);

  async function send() {
    if (template == null) return;
    setBusy(true);
    setError(null);
    try {
      await sendTaunt(supabase, { feudId, templateId: template.id, picks });
      onSent();
      onClose();
    } catch (e) {
      const msg = errMessage(e);
      setError(msg.includes('taunt_spent') ? t('forge.spent') : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <BrutalText text={t('forge.title')} font={font('display')} style={styles.title} />
          <Text style={[styles.subtitle, body]}>{t('forge.subtitle')}</Text>
          <View style={styles.columns}>
            {bySlot.map((words, slot) => (
              <ScrollView key={slot} style={styles.column} contentContainerStyle={styles.columnInner}>
                {words.map((w) => {
                  const on = picks[slot] === w.word_index;
                  return (
                    <Pressable
                      key={w.word_index}
                      onPress={() => {
                        const next = [...picks];
                        next[slot] = w.word_index;
                        setPicks(next);
                      }}
                      style={[styles.word, on && styles.wordOn]}
                    >
                      <Text style={[styles.wordText, body, on && styles.wordTextOn]}>{w.word}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ))}
          </View>
          {template != null && (
            <View style={styles.preview}>
              <Text style={[styles.previewLabel, body]}>{t('forge.preview')}</Text>
              <Text style={[styles.previewText, body]}>{assembleTaunt(template, banks, picks)}</Text>
            </View>
          )}
          {error != null && <Text style={[styles.error, body]}>{error}</Text>}
          <GrimButton label={t('forge.send')} onPress={send} disabled={busy || template == null} />
          <GrimButton label={t('common.cancel')} variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.9)', justifyContent: 'center', padding: spacing[2] },
  sheet: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[3], gap: spacing[2], maxHeight: '88%' },
  title: { color: colors.bone, fontSize: 20, textAlign: 'center', letterSpacing: 1 },
  subtitle: { color: colors.smoke, fontSize: 12, textAlign: 'center' },
  columns: { flexDirection: 'row', gap: spacing[0], height: 240 },
  column: { flex: 1 },
  columnInner: { gap: spacing[0] },
  word: { backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim, borderRadius: radii.chip, paddingVertical: spacing[0], paddingHorizontal: spacing[0] },
  wordOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  wordText: { color: colors.ash, fontSize: 11, textAlign: 'center' },
  wordTextOn: { color: colors.bone },
  preview: { backgroundColor: colors.crypt, borderRadius: radii.button, padding: spacing[2] },
  previewLabel: { color: colors.smoke, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  previewText: { color: colors.bone, fontSize: 14, fontStyle: 'italic', marginTop: 4 },
  error: { color: colors.blood, fontSize: 13, textAlign: 'center' },
});
