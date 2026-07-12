import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../auth/session';
import { tierFor, type BrutalityTier, type FontSlot } from './brutality';

interface BrutalityCtx {
  tier: Readonly<BrutalityTier>;
  setLevel: (level: number) => void;
  /** Font family for a slot, or undefined = system. Numeral inherits body. */
  font: (slot: FontSlot) => string | undefined;
}

function makeCtx(level: number, setLevel: (l: number) => void): BrutalityCtx {
  const tier = tierFor(level);
  return {
    tier,
    setLevel,
    font: (slot) => (slot === 'numeral' ? (tier.fonts.numeral ?? tier.fonts.body) : tier.fonts[slot]),
  };
}

// Default (no provider, e.g. unit tests): tier 1, setter is a no-op.
const Ctx = createContext<BrutalityCtx>(makeCtx(1, () => {}));

export function BrutalityProvider({ children }: { children: ReactNode }) {
  const { session, hasProfile } = useSession();
  const [level, setLevel] = useState(1);

  useEffect(() => {
    if (session == null || !hasProfile) {
      setLevel(1);
      return;
    }
    supabase.from('profiles').select('brutality_tier').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.brutality_tier != null) setLevel(data.brutality_tier);
      });
  }, [session?.user.id, hasProfile]);

  return <Ctx.Provider value={makeCtx(level, setLevel)}>{children}</Ctx.Provider>;
}

export function useBrutality(): BrutalityCtx {
  return useContext(Ctx);
}
