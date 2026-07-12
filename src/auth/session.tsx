import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
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

  // Server-verified session check. A JWT can outlive its account (account
  // deleted, dev db reset): getUser() asks the server. GENUINELY dead session
  // -> signOut so the guard lands on the auth gate (contract dead-session
  // rule). Network/retryable failures are NOT dead sessions -- airplane mode
  // must never sign the user out -- so they return null (unknown) and callers
  // keep the last known state.
  async function verifySession(s: Session | null): Promise<boolean | null> {
    if (s == null) return false;
    const { data, error } = await supabase.auth.getUser();
    if (error != null) {
      if (isAuthRetryableFetchError(error)) return null; // offline/5xx: unknown, keep state
      await supabase.auth.signOut();
      return false;
    }
    if (data.user == null) {
      await supabase.auth.signOut();
      return false;
    }
    const { data: profile, error: pe } = await supabase
      .from('profiles').select('id, language').eq('id', data.user.id).maybeSingle();
    if (pe != null) return null; // profile fetch failed (network): unknown, keep state
    if (profile?.language != null && profile.language !== i18n.language) {
      await setAppLanguage(profile.language);
    }
    return profile != null;
  }

  async function refreshProfile() {
    const { data } = await supabase.auth.getSession();
    const verified = await verifySession(data.session);
    if (verified != null) setHasProfile(verified);
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      const verified = await verifySession(data.session);
      if (verified != null) setHasProfile(verified);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      setSession(s);
      const verified = await verifySession(s);
      if (verified != null) setHasProfile(verified);
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
