import { Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing } from '../theme/tokens';

/** Tinder-style frosted settings button, pinned top-right on every tab. */
export function GlassGear() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.glass, pressed && styles.pressed]}
      onPress={() => router.push('/settings')}
    >
      <Text style={styles.gear}>⚙︎</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  glass: {
    position: 'absolute', top: spacing[5] * 1.5, right: spacing[4], zIndex: 10,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(232,228,218,0.08)',
    borderWidth: 1, borderColor: 'rgba(232,228,218,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  pressed: { backgroundColor: 'rgba(232,228,218,0.16)' },
  gear: { color: colors.bone, fontSize: 22 },
});
