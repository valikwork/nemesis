import { useState } from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { blockUser, reportUser } from '../lib/feuds';
import { errMessage } from '../lib/err';
import { GrimButton } from './GrimButton';
import { GrimInput } from './GrimInput';
import { colors, radii, spacing } from '../theme/tokens';

interface Props {
  visible: boolean;
  targetId: string;
  targetName: string;
  feudId?: string;
  onClose: () => void;
  onBlocked: () => void;
}

export function SafetySheet({ visible, targetId, targetName, feudId, onClose, onBlocked }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'menu' | 'block' | 'report'>('menu');
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setMode('menu');
    setReason('');
    setSent(false);
    setError(null);
  }

  async function doBlock() {
    setBusy(true);
    setError(null);
    try {
      await blockUser(supabase, targetId);
      reset();
      onBlocked();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function doReport() {
    if (reason.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await reportUser(supabase, { targetId, feudId, reason });
      setSent(true);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          {mode === 'menu' && (
            <>
              <GrimButton label={t('settings.report')} variant="ghost" onPress={() => setMode('report')} />
              <GrimButton label={t('settings.block')} variant="ghost" onPress={() => setMode('block')} />
            </>
          )}
          {mode === 'block' && (
            <>
              <Text style={styles.title}>{t('safety.blockConfirmTitle', { name: targetName })}</Text>
              <Text style={styles.body}>{t('safety.blockConfirmBody')}</Text>
              <GrimButton label={t('settings.block')} onPress={doBlock} disabled={busy} />
            </>
          )}
          {mode === 'report' && (
            <>
              <Text style={styles.title}>{t('safety.reportTitle')}</Text>
              {sent ? (
                <Text style={styles.body}>{t('safety.reportSent')}</Text>
              ) : (
                <>
                  <GrimInput value={reason} onChangeText={setReason} multiline numberOfLines={3}
                    style={styles.reasonInput} placeholder={t('safety.reportPlaceholder')} />
                  <GrimButton label={t('settings.report')} onPress={doReport}
                    disabled={busy || reason.trim().length === 0} />
                </>
              )}
            </>
          )}
          {error != null && <Text style={styles.error}>{error}</Text>}
          <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => { reset(); onClose(); }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.9)', justifyContent: 'center', padding: spacing[4] },
  sheet: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[4], gap: spacing[2] },
  title: { color: colors.bone, fontSize: 18, textAlign: 'center', letterSpacing: 1 },
  body: { color: colors.ash, fontSize: 14, textAlign: 'center' },
  reasonInput: { minHeight: 70, textAlignVertical: 'top' },
  error: { color: colors.blood, fontSize: 13, textAlign: 'center' },
});
