import { Tabs } from 'expo-router';
import { Text, View, type ColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, semantic } from '../../src/theme/tokens';
import { GlassGear } from '../../src/components/GlassGear';

function glyphIcon(glyph: string) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ fontSize: 20, color: color as string }}>{glyph}</Text>;
  };
}

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1 }}>
      <GlassGear />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: semantic.bg },
          tabBarStyle: {
            backgroundColor: colors.ink,
            borderTopColor: colors.venomDim,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: colors.blood,
          tabBarInactiveTintColor: colors.smoke,
          tabBarLabelStyle: { fontSize: 11, letterSpacing: 0.5 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t('tabs.feuds'), tabBarIcon: glyphIcon('⚔︎') }} />
        <Tabs.Screen name="deck" options={{ title: t('tabs.hunt'), tabBarIcon: glyphIcon('⌖') }} />
        <Tabs.Screen name="summon" options={{ title: t('tabs.summon'), tabBarIcon: glyphIcon('⚒︎') }} />
        <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: glyphIcon('✠') }} />
      </Tabs>
    </View>
  );
}
