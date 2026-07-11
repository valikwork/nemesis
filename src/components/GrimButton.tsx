import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}

export function GrimButton({ label, onPress, disabled, variant = 'primary' }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      pointerEvents={disabled ? 'none' : undefined}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.ghost,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, variant === 'ghost' && styles.ghostLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: spacing[2], paddingHorizontal: spacing[4], borderRadius: radii.button, alignItems: 'center', borderWidth: 1 },
  primary: { backgroundColor: colors.bloodMist, borderColor: colors.blood },
  ghost: { backgroundColor: 'transparent', borderColor: colors.venomDim },
  pressed: { backgroundColor: colors.bloodDeep },
  disabled: { opacity: 0.4 },
  label: { color: colors.bone, fontSize: 15, letterSpacing: 1.5, textTransform: 'uppercase' },
  ghostLabel: { color: colors.ash },
});
