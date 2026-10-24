import { useCallback, useMemo, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';

export const SEARCH_INPUT_CLEAR = { backgroundColor: 'transparent', borderWidth: 0, boxShadow: 'none' } as const;

/** The same quiet inset search surface as web, with a deeper focused state. */
export function useSearchFieldMaterial() {
  const { isLight } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const surface = useMemo<ViewStyle>(() => ({
    // The theme colour pass supplies the matching ink wash in System Light.
    backgroundColor: focused ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.06)',
    borderWidth: 0,
    boxShadow: isLight
      ? focused
        ? 'inset 0px 2px 3px rgba(11,11,13,0.075), 0px 1px 0px rgba(255,255,255,0.8)'
        : 'inset 0px 1px 2px rgba(11,11,13,0.045), 0px 1px 0px rgba(255,255,255,0.75)'
      : focused
        ? 'inset 0px 2px 4px rgba(0,0,0,0.28), inset 0px -1px 0px rgba(255,255,255,0.05)'
        : 'inset 0px 1px 3px rgba(0,0,0,0.22), inset 0px -1px 0px rgba(255,255,255,0.035)',
  }), [focused, isLight]);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { surface, onFocus, onBlur };
}
