import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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

  async function checkProfile(s: Session | null): Promise<boolean> {
    if (!s) return false;
    const { data } = await supabase.from('profiles').select('id').eq('id', s.user.id).maybeSingle();
    return data != null;
  }

  async function refreshProfile() {
    const { data } = await supabase.auth.getSession();
    setHasProfile(await checkProfile(data.session));
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setHasProfile(await checkProfile(data.session));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      setSession(s);
      setHasProfile(await checkProfile(s));
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
