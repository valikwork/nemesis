import { Stack } from 'expo-router';
import { semantic } from '../src/theme/tokens';
import '../src/i18n';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: semantic.bg },
        headerTintColor: semantic.text,
        contentStyle: { backgroundColor: semantic.bg },
        headerShown: false,
      }}
    />
  );
}
