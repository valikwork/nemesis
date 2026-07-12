import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Share, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';
import { useSession } from '../src/auth/session';
import { createInvite, pendingInvites, revokeInvite, myOrdeals, type PendingInvite } from '../src/lib/feuds';
import { ordealLabel, type OrdealRow } from '../src/onboarding/ordeal-labels';
import { GrimButton } from '../src/components/GrimButton';
import { GrimInput } from '../src/components/GrimInput';
import { colors, radii, semantic, spacing } from '../src/theme/tokens';
import { errMessage } from '../src/lib/err';

export default function Summon() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const [ordeals, setOrdeals] = useState<OrdealRow[]>([]);
  const [ordealId, setOrdealId] = useState<string | null>(null);
  const [showdown, setShowdown] = useState(false);
  const [goal, setGoal] = useState('');
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    if (session == null) return;
    const [mine, pend] = await Promise.all([myOrdeals(supabase, session.user.id), pendingInvites(supabase)]);
    setOrdeals(mine);
    setPending(pend);
    if (mine.length > 0 && ordealId == null) setOrdealId(mine[0].id);
  }

  useEffect(() => { reload(); }, [session?.user.id]);

  const goalNum = Number(goal);
  const goalValid = !showdown || (Number.isFinite(goalNum) && goalNum > 0);

  async function create() {
    if (ordealId == null || !goalValid) return;
    setBusy(true);
    setError(null);
    try {
      const invite = await createInvite(supabase, {
        ordealId, mode: showdown ? 'showdown' : 'endless', goal: showdown ? goalNum : null,
      });
      await Share.share({ message: `${t('summon.shareText')}\nnemesis://feud/${invite.code}` });
      await reload();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('summon.sheetTitle')}</Text>
      <FlatList
        data={ordeals}
        keyExtractor={(o) => o.id}
        style={styles.ordealList}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setOrdealId(item.id)}
            style={[styles.row, ordealId === item.id && styles.rowOn]}
          >
            <Text style={[styles.rowLabel, ordealId === item.id && styles.rowLabelOn]}>
              {ordealLabel(item, i18n.language)}
            </Text>
          </Pressable>
        )}
      />
      <View style={styles.modeRow}>
        <Text style={styles.modeLabel}>
          {showdown ? t('feud.modeShowdown', { goal: goal || '…' }) : t('feud.modeEndless')}
        </Text>
        <Switch value={showdown} onValueChange={setShowdown}
          trackColor={{ false: colors.venomDim, true: colors.bloodDeep }} thumbColor={colors.bone} />
      </View>
      {showdown && (
        <GrimInput value={goal} onChangeText={setGoal} placeholder="100" keyboardType="numeric" />
      )}
      {error != null && <Text style={styles.error}>{error}</Text>}
      <GrimButton label={t('summon.create')} onPress={create}
        disabled={busy || ordealId == null || !goalValid} />
      {pending.length > 0 && (
        <View style={styles.pendingWrap}>
          <Text style={styles.pendingTitle}>{t('home.pendingTitle')}</Text>
          {pending.map((inv) => (
            <View key={inv.id} style={styles.pendingRow}>
              <Text style={styles.pendingText}>
                {ordealLabel(inv.ordeal, i18n.language)}
                {inv.mode === 'showdown' ? ` · ${inv.goal_value}` : ''}
              </Text>
              <Pressable onPress={async () => { await revokeInvite(supabase, inv.id); reload(); }}>
                <Text style={styles.revoke}>{t('summon.revoke')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  title: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  ordealList: { maxHeight: 260 },
  list: { gap: spacing[1] },
  row: {
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.button, paddingVertical: spacing[2], paddingHorizontal: spacing[3],
  },
  rowOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  rowLabel: { color: colors.ash, fontSize: 15 },
  rowLabelOn: { color: colors.bone },
  modeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeLabel: { color: colors.ash, fontSize: 14 },
  error: { color: colors.blood, fontSize: 13 },
  pendingWrap: { marginTop: spacing[2], gap: spacing[1] },
  pendingTitle: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  pendingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingText: { color: colors.ash, fontSize: 13 },
  revoke: { color: colors.blood, fontSize: 13 },
});
