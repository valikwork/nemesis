import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import i18n, { setAppLanguage } from '../i18n';

export interface SessionState {
  loading: boolean;
  session: Session | null;
  hasProfile: boolean;
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  loading: true,
  session: null,
  hasProfile: false,
  refreshProfile: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [hasProfile, setHasProfile] = useState(false);

  // Server-verified session check. A JWT can outlive its account (e.g. account
  // deleted, dev db reset): getUser() asks the server. Dead session -> signOut
  // so the guard lands on the auth gate instead of stranding the user
  // (contract amendment 2026-07-12, dead-session rule).
  async function verifySession(s: Session | null): Promise<boolean> {
    if (s == null) return false;
    const { data, error } = await supabase.auth.getUser();
    if (error != null || data.user == null) {
      await supabase.auth.signOut();
      return false;
    }
    const { data: profile } = await supabase.from('profiles').select('id, language').eq('id', data.user.id).maybeSingle();
    if (profile?.language != null && profile.language !== i18n.language) {
      await setAppLanguage(profile.language);
    }
    return profile != null;
  }

  async function refreshProfile() {
    const { data } = await supabase.auth.getSession();
    setHasProfile(await verifySession(data.session));
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setHasProfile(await verifySession(data.session));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      setSession(s);
      setHasProfile(await verifySession(s));
      setLoading(false);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  return (
    <SessionContext.Provider value={{ loading, session, hasProfile, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
