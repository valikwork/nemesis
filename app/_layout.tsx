import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { semantic } from '../src/theme/tokens';
import { SessionProvider, useSession } from '../src/auth/session';
import { routeFor } from '../src/auth/route-for';
import '../src/i18n';

function Guard() {
  const { loading, session, hasProfile } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const target = routeFor({ session: session != null, hasProfile });
    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    if (target === '/(auth)/sign-in' && !inAuth) router.replace('/(auth)/sign-in');
    else if (target === '/(onboarding)/mask' && !inOnboarding) router.replace('/(onboarding)/mask');
    else if (target === '/' && (inAuth || inOnboarding)) router.replace('/');
  }, [loading, session, hasProfile, segments]);

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

export default function RootLayout() {
  return (
    <SessionProvider>
      <Guard />
    </SessionProvider>
  );
}
