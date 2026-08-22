import { useEffect, useState } from "react";

/**
 * The value, but only once it has stopped changing for `delay` ms.
 *
 * Port of web's `use-debounced-value`, used by the Music feed's radio search so
 * a query is not fired per keystroke against radio-browser.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
