import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, semantic, spacing } from '../src/theme/tokens';

export default function Home() {
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <Text style={styles.logo}>NEMESIS</Text>
      <Text style={styles.tagline}>{t('tagline')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, alignItems: 'center', justifyContent: 'center', gap: spacing[1] },
  logo: { color: semantic.text, fontSize: 44, letterSpacing: 6 },
  tagline: { color: colors.venomDeep, fontSize: 14, letterSpacing: 2 },
});
