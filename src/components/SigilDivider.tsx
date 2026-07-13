import { View, Text, StyleSheet } from 'react-native';
import { useBrutality } from '../theme/brutality-context';
import { PARTY_PALETTE } from '../theme/brutal-text';
import { colors, spacing } from '../theme/tokens';

const JAG = '╱╲'.repeat(14);

/** Tier-aware section divider (design-system §4): straight rule → jagged →
 * jagged doubled → party streamers. Text-drawn, no SVG dependency. */
export function SigilDivider() {
  const { tier } = useBrutality();

  if (tier.dividers === 'straight') {
    return <View style={styles.straight} />;
  }
  if (tier.dividers === 'streamers') {
    return (
      <Text style={styles.jag} numberOfLines={1}>
        {[...'⁂✦⁂✦⁂✦⁂✦⁂✦⁂'].map((ch, i) => (
          <Text key={i} style={{ color: PARTY_PALETTE[i % PARTY_PALETTE.length] }}>{ch} </Text>
        ))}
      </Text>
    );
  }
  return (
    <View>
      <Text style={styles.jag} numberOfLines={1}>{JAG}</Text>
      {tier.dividers === 'jagged-doubled' && (
        <Text style={[styles.jag, styles.jagSecond]} numberOfLines={1}>{JAG}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  straight: { height: 1, backgroundColor: colors.venomDim, marginVertical: spacing[2] },
  jag: { color: colors.venomDim, fontSize: 10, textAlign: 'center', letterSpacing: 1, marginVertical: spacing[1] },
  jagSecond: { marginTop: -spacing[1], opacity: 0.5 },
});
