import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, radii } from '../theme/tokens';

interface Props {
  glyph: string;
  selected: boolean;
  onPress: () => void;
}

export function MaskTile({ glyph, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.tile, selected && styles.selected]}
    >
      <Text style={[styles.glyph, selected && styles.glyphSelected]}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 72, height: 72, borderRadius: radii.card,
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    alignItems: 'center', justifyContent: 'center',
  },
  selected: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  glyph: { fontSize: 34, color: colors.venomDeep },
  glyphSelected: { color: colors.bone },
});
