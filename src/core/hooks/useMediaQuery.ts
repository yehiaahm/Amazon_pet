import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** True at tablet width and below (sidebar becomes an off-canvas drawer). */
export function useIsTabletDown(): boolean {
  return useMediaQuery('(max-width: 1024px)');
}

/** True at phone width and below. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 640px)');
}
