import { useFonts } from 'expo-font';
import { BagelFatOne_400Regular } from '@expo-google-fonts/bagel-fat-one';

/**
 * Registers the five brutality-tier families under the exact keys
 * brutality.ts expects. Runtime loading (no native embed needed).
 *
 * Coverage (verified 2026-07-12): all four Fontspace files are full-Latin
 * both cases, ZERO Cyrillic — UA text falls back to the system font
 * per-glyph, which is the accepted per-language fallback map (spec §3).
 * Maskdown has no digits; numerals ride the body slot anyway.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    Pickyside: require('../../assets/fonts/Pickyside.otf'),
    SoulsideBetrayed: require('../../assets/fonts/SoulsideBetrayed.ttf'),
    GroovyTribal: require('../../assets/fonts/GroovyTribal.ttf'),
    Maskdown: require('../../assets/fonts/Maskdown.otf'),
    BagelFatOne: BagelFatOne_400Regular,
  });
  return loaded;
}
