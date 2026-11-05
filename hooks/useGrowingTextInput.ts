import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import type { NativeSyntheticEvent, TextInputContentSizeChangeEventData } from 'react-native';

/**
 * Multiline field that grows with its text up to `maxHeight`, then scrolls.
 *
 * Android needs a measured height; maxHeight alone leaves a single line.
 * iPhone is the opposite: a fixed height stops the field measuring its own
 * text, so the reported content size never grows past the box and long
 * comments were stuck at two lines with no way to scroll. On iPhone the field
 * sizes itself between min and max and can always scroll.
 */
export function useGrowingTextInput(value: string, minHeight = 24, maxHeight = 140) {
  const [measuredHeight, setMeasuredHeight] = useState(minHeight);
  const onContentSizeChange = useCallback((event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    const next = Math.ceil(event.nativeEvent.contentSize.height);
    if (Number.isFinite(next)) setMeasuredHeight(Math.max(minHeight, Math.min(maxHeight, next)));
  }, [minHeight, maxHeight]);
  const height = value.length ? measuredHeight : minHeight;
  const selfSizing = Platform.OS === 'ios';
  /** Size style for the TextInput; `floor` keeps it at least that tall. */
  const sizeStyle = useCallback(
    (floor = 0) => (selfSizing
      ? { minHeight: Math.max(minHeight, floor), maxHeight }
      : { height: Math.max(height, floor), maxHeight }),
    [selfSizing, minHeight, maxHeight, height],
  );
  return {
    height,
    sizeStyle,
    onContentSizeChange,
    scrollEnabled: selfSizing || height >= maxHeight,
  };
}
