import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import type { NativeSyntheticEvent, TextInputContentSizeChangeEventData } from 'react-native';
import { useGrowingTextInput } from '../../hooks/useGrowingTextInput';

const realOS = Platform.OS;
afterEach(() => { Platform.OS = realOS; });

it('grows wrapped comments, scrolls at the limit, shrinks on editing and resets after send', () => {
  Platform.OS = 'android';
  const { result, rerender } = renderHook<ReturnType<typeof useGrowingTextInput>, { value: string }>(
    ({ value }) => useGrowingTextInput(value), { initialProps: { value: 'long comment' } },
  );
  const measure = (height: number) => act(() => result.current.onContentSizeChange({ nativeEvent: { contentSize: { width: 200, height } } } as NativeSyntheticEvent<TextInputContentSizeChangeEventData>));
  measure(72);
  expect(result.current.height).toBe(72);
  expect(result.current.sizeStyle(40)).toEqual({ height: 72, maxHeight: 140 });
  expect(result.current.scrollEnabled).toBe(false);
  measure(200);
  expect(result.current.height).toBe(140);
  expect(result.current.scrollEnabled).toBe(true);
  measure(36);
  expect(result.current.height).toBe(36);
  expect(result.current.sizeStyle(40)).toEqual({ height: 40, maxHeight: 140 });
  expect(result.current.scrollEnabled).toBe(false);
  rerender({ value: '' });
  expect(result.current.height).toBe(24);
});

it('lets the iPhone field size itself and always scroll, so long comments never get stuck', () => {
  Platform.OS = 'ios';
  const { result } = renderHook(() => useGrowingTextInput('a long comment that wraps past two lines'));
  expect(result.current.sizeStyle(40)).toEqual({ minHeight: 40, maxHeight: 140 });
  expect(result.current.sizeStyle()).toEqual({ minHeight: 24, maxHeight: 140 });
  expect(result.current.sizeStyle()).not.toHaveProperty('height');
  expect(result.current.scrollEnabled).toBe(true);
});
