import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';
import { useSession } from '../src/auth/session';
import { listFeudsWithMeta, type FeudWithMeta } from '../src/lib/feuds';
import { FeudRowCard } from '../src/components/FeudRowCard';
import { GrimButton } from '../src/components/GrimButton';
import { colors, semantic, spacing } from '../src/theme/tokens';

export default function Home() {
  const { t } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const [feuds, setFeuds] = useState<FeudWithMeta[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (session == null) return;
    setRefreshing(true);
    try {
      setFeuds(await listFeudsWithMeta(supabase, session.user.id));
    } finally {
      setRefreshing(false);
    }
  }, [session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const active = feuds.filter((f) => f.feud.status === 'active');
  const buried = feuds.filter((f) => f.feud.status === 'ended' || f.feud.status === 'dissolved');

  return (
    <View style={styles.root}>
      <Pressable style={styles.gear} onPress={() => router.push('/settings')}>
        <Text style={styles.gearText}>⚙︎</Text>
      </Pressable>
      <Text style={styles.logo}>NEMESIS</Text>
      <Text style={styles.title}>{t('home.title')}</Text>
      <FlatList
        data={active}
        keyExtractor={(f) => f.feud.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.blood} />}
        renderItem={({ item }) => (
          <FeudRowCard item={item} onPress={() => router.push(`/feuds/${item.feud.id}`)} />
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t('home.empty')}</Text>}
        ListFooterComponent={
          buried.length > 0 ? (
            <View style={styles.buriedWrap}>
              <Text style={styles.buriedTitle}>{t('home.buried')}</Text>
              {buried.map((item) => (
                <FeudRowCard key={item.feud.id} item={item} onPress={() => router.push(`/feuds/${item.feud.id}`)} />
              ))}
            </View>
          ) : null
        }
      />
      <GrimButton label={t('home.summonCta')} onPress={() => router.push('/summon')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  gear: { position: 'absolute', top: spacing[5] * 1.5, right: spacing[4] },
  gearText: { color: colors.smoke, fontSize: 22 },
  logo: { color: semantic.text, fontSize: 30, letterSpacing: 5, textAlign: 'center' },
  title: { color: colors.venomDeep, fontSize: 13, letterSpacing: 2, textAlign: 'center', marginBottom: spacing[2] },
  list: { gap: spacing[2], flexGrow: 1 },
  empty: { color: colors.smoke, fontSize: 14, textAlign: 'center', marginTop: spacing[5] },
  buriedWrap: { marginTop: spacing[4], gap: spacing[2] },
  buriedTitle: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
});
