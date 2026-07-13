import { View, Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { metalHalves, partyColor } from '../theme/brutal-text';

interface Props {
  text: string;
  font: string | undefined; // resolved family (useBrutality().font(slot))
  style?: StyleProp<TextStyle>;
  align?: 'left' | 'center'; // metal-mirror word row alignment
}

/**
 * Tier-aware display text (owner direction, 2026-07-12):
 * - Maskdown: each word wears first+last uppercase, splits in the middle and
 *   the right half renders mirrored (scaleX -1) — metal band logo symmetry.
 * - BagelFatOne: every letter gets its own bright party color.
 * - anything else: plain Text with the family applied.
 */
export function BrutalText({ text, font, style, align = 'center' }: Props) {
  if (font === 'Maskdown') {
    return (
      <View style={[styles.wordRow, align === 'left' && styles.wordRowLeft]}>
        {text.split(/\s+/).filter(Boolean).map((word, wi) => {
          const { left, right } = metalHalves(word);
          return (
            <View key={`${word}-${wi}`} style={styles.word}>
              <Text style={[style, styles.noTransform, { fontFamily: 'Maskdown' }]}>{left}</Text>
              {right !== '' && (
                <View style={styles.mirror}>
                  <Text style={[style, styles.noTransform, { fontFamily: 'Maskdown' }]}>{right}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  if (font === 'BagelFatOne') {
    return (
      <Text style={[style, styles.noTransform, { fontFamily: 'BagelFatOne' }]}>
        {[...text].map((ch, i) => (
          <Text key={i} style={{ color: partyColor(text, i) }}>{ch}</Text>
        ))}
      </Text>
    );
  }

  return <Text style={[style, { fontFamily: font }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  wordRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 10 },
  wordRowLeft: { justifyContent: 'flex-start' },
  word: { flexDirection: 'row', alignItems: 'flex-end' },
  mirror: { transform: [{ scaleX: -1 }] },
  // the case-play IS the treatment — a parent textTransform must not undo it
  noTransform: { textTransform: 'none' },
});
