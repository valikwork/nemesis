import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';
import { useSession } from '../src/auth/session';
import { colors, semantic, spacing } from '../src/theme/tokens';

export default function Home() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (session == null) return;
    supabase.from('profiles').select('nemesis_name').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setName(data?.nemesis_name ?? null));
  }, [session?.user.id]);

  return (
    <View style={styles.root}>
      <Text style={styles.logo}>NEMESIS</Text>
      <Text style={styles.tagline}>{t('tagline')}</Text>
      {name != null && <Text style={styles.persona}>{name}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, alignItems: 'center', justifyContent: 'center', gap: spacing[1] },
  logo: { color: semantic.text, fontSize: 44, letterSpacing: 6 },
  tagline: { color: colors.venomDeep, fontSize: 14, letterSpacing: 2 },
  persona: { color: colors.blood, fontSize: 18, letterSpacing: 1, marginTop: spacing[3] },
});
