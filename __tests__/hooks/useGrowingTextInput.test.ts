import { act, renderHook } from '@testing-library/react-native';
import type { NativeSyntheticEvent, TextInputContentSizeChangeEventData } from 'react-native';
import { useGrowingTextInput } from '../../hooks/useGrowingTextInput';

it('grows wrapped comments, scrolls at the limit, shrinks on editing and resets after send', () => {
  const { result, rerender } = renderHook<ReturnType<typeof useGrowingTextInput>, { value: string }>(
    ({ value }) => useGrowingTextInput(value), { initialProps: { value: 'long comment' } },
  );
  const measure = (height: number) => act(() => result.current.onContentSizeChange({ nativeEvent: { contentSize: { width: 200, height } } } as NativeSyntheticEvent<TextInputContentSizeChangeEventData>));
  measure(72);
  expect(result.current.height).toBe(72);
  expect(result.current.scrollEnabled).toBe(false);
  measure(200);
  expect(result.current.height).toBe(140);
  expect(result.current.scrollEnabled).toBe(true);
  measure(36);
  expect(result.current.height).toBe(36);
  expect(result.current.scrollEnabled).toBe(false);
  rerender({ value: '' });
  expect(result.current.height).toBe(24);
});
