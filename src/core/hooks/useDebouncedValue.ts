import { useEffect, useState } from 'react';

/** Debounce a value — default 280ms for POS search responsiveness. */
export function useDebouncedValue<T>(value: T, delayMs = 280): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
