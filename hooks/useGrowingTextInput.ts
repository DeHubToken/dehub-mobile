import { useCallback, useState } from 'react';
import type { NativeSyntheticEvent, TextInputContentSizeChangeEventData } from 'react-native';

/** Android needs a measured height; maxHeight alone leaves a single line. */
export function useGrowingTextInput(value: string, minHeight = 24, maxHeight = 140) {
  const [measuredHeight, setMeasuredHeight] = useState(minHeight);
  const onContentSizeChange = useCallback((event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    const next = Math.ceil(event.nativeEvent.contentSize.height);
    if (Number.isFinite(next)) setMeasuredHeight(Math.max(minHeight, Math.min(maxHeight, next)));
  }, [minHeight, maxHeight]);
  const height = value.length ? measuredHeight : minHeight;
  return { height, onContentSizeChange, scrollEnabled: height >= maxHeight };
}
