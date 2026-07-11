import { View, TextInput, Text, StyleSheet, type TextInputProps } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';

interface Props extends TextInputProps {
  error?: string | null;
}

export function GrimInput({ error, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <TextInput
        placeholderTextColor={colors.smoke}
        style={[styles.input, error != null && styles.inputError, style]}
        {...rest}
      />
      {error != null && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[0] },
  input: {
    backgroundColor: colors.crypt,
    borderWidth: 1,
    borderColor: colors.venomDim,
    borderRadius: radii.button,
    color: colors.bone,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    fontSize: 15,
  },
  inputError: { borderColor: colors.blood },
  error: { color: colors.blood, fontSize: 12 },
});
