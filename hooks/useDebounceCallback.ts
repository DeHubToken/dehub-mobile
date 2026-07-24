import { useRef, useCallback } from 'react';

export function useDebounceCallback<T extends (...args: any[]) => any>(fn: T, delay = 400) {
  const timer = useRef<NodeJS.Timeout | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}
