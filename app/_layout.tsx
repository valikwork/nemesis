import { Stack, useRouter, useSegments, useGlobalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { semantic } from '../src/theme/tokens';
import { SessionProvider, useSession } from '../src/auth/session';
import { routeFor } from '../src/auth/route-for';
import { supabase } from '../src/lib/supabase';
import { registerPushToken } from '../src/lib/push';
import '../src/i18n';

// A summons deep link (nemesis://feud/{code}) opened by a signed-out or
// mid-onboarding user must survive the auth/onboarding detour -- the code is
// stashed before redirecting and replayed once the guard finally routes home.
const PENDING_INVITE_KEY = 'nemesis.pending-invite';

function Guard() {
  const { loading, session, hasProfile } = useSession();
  const segments = useSegments();
  const params = useGlobalSearchParams<{ code?: string }>();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const target = routeFor({ session: session != null, hasProfile });
    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const onInviteLanding = segments[0] === 'feud' && typeof params.code === 'string';

    (async () => {
      if (target === '/(auth)/sign-in' && !inAuth) {
        if (onInviteLanding) await AsyncStorage.setItem(PENDING_INVITE_KEY, params.code!);
        router.replace('/(auth)/sign-in');
      } else if (target === '/(onboarding)/sigil' && !inOnboarding) {
        if (onInviteLanding) await AsyncStorage.setItem(PENDING_INVITE_KEY, params.code!);
        router.replace('/(onboarding)/sigil');
      } else if (target === '/' && (inAuth || inOnboarding)) {
        const pending = await AsyncStorage.getItem(PENDING_INVITE_KEY);
        if (pending != null) {
          await AsyncStorage.removeItem(PENDING_INVITE_KEY);
          router.replace(`/feud/${pending}`);
        } else {
          router.replace('/');
        }
      }
    })();
  }, [loading, session, hasProfile, segments, params.code]);

  useEffect(() => {
    if (session != null && hasProfile) {
      registerPushToken(supabase, session.user.id);
    }
  }, [session?.user.id, hasProfile]);

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
