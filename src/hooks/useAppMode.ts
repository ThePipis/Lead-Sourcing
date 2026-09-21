import { useCallback, useEffect, useState } from 'react';

export type AppMode = 'DEMO' | 'LIVE';

const KEY = 'appMode';

/**
 * The app runs in one of two worlds and never mixes them.
 *
 * **Simulación (DEMO)** is the practice file: seeded campaigns, mock Yelp
 * candidates, a synthetic household pool. Nothing here is real business, so it
 * is safe to click anything.
 *
 * **En vivo (LIVE)** is the real one: only campaigns you opened yourself, real
 * Yelp/Geoapify searches, and a real audience. A fresh install starts empty on
 * purpose — that is what makes it possible to work one campaign from zero.
 *
 * Everything downstream reads from here: which campaigns the drawer lists, and
 * whether lead sourcing and curation run against mocks or the real services.
 */
export function useAppMode() {
  const [mode, setMode] = useState<AppMode>(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === 'DEMO' || stored === 'LIVE') return stored;
    } catch {
      /* private windows and blocked site data: fall through to the default */
    }
    return 'DEMO';
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* the choice simply does not survive a reload */
    }
  }, [mode]);

  const setAppMode = useCallback((next: AppMode) => setMode(next), []);

  return {
    mode,
    setAppMode,
    /** Lead sourcing and curation run against mocks only in the practice file. */
    mockMode: mode === 'DEMO',
  };
}
