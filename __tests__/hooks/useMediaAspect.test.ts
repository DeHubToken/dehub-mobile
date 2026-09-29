import { act, renderHook } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { DEFAULT_ASPECT, useMediaAspect } from '../../hooks/useMediaAspect';

jest.mock('expo-image', () => ({ Image: { loadAsync: jest.fn() } }));

// Each measurement is held open until the test settles it, so a test can put
// a URL change between the request and its answer.
const pending = new Map<string, (size: { width: number; height: number }) => void>();
const loadAsync = Image.loadAsync as jest.Mock;

async function settle(uri: string, width: number, height: number) {
  await act(async () => {
    pending.get(uri)!({ width, height });
  });
}

type Props = { uri: string; post: string };

describe('useMediaAspect', () => {
  beforeEach(() => {
    pending.clear();
    loadAsync.mockReset();
    loadAsync.mockImplementation(
      (uri: string) =>
        new Promise((resolve) => {
          pending.set(uri, ({ width, height }) => resolve({ width, height, release: () => {} }));
        }),
    );
  });

  it('is 16:9 until the thumbnail is measured', async () => {
    const { result } = renderHook(() => useMediaAspect('first-clip', 'p1'));
    expect(result.current).toBe(DEFAULT_ASPECT);
    await settle('first-clip', 900, 1200);
    expect(result.current).toBe(0.75);
  });

  it('keeps the shape while the same post re-measures a new thumbnail URL', async () => {
    const { result, rerender } = renderHook<number, Props>(({ uri, post }) => useMediaAspect(uri, post), {
      initialProps: { uri: 'portrait-828', post: 'p2' },
    });
    await settle('portrait-828', 900, 1200);
    // A resize that crosses a width step builds a new URL for the same post.
    rerender({ uri: 'portrait-1080', post: 'p2' });
    expect(result.current).toBe(0.75);
    await settle('portrait-1080', 1080, 1440);
    expect(result.current).toBe(0.75);
  });

  it('never gives another post the previous post\'s shape', async () => {
    const { result, rerender } = renderHook<number, Props>(({ uri, post }) => useMediaAspect(uri, post), {
      initialProps: { uri: 'tall-clip', post: 'p3' },
    });
    await settle('tall-clip', 900, 1200);
    rerender({ uri: 'square-clip', post: 'p4' });
    expect(result.current).toBe(DEFAULT_ASPECT);
    // Handed a third post before the second was measured: the late answer for
    // the second clip does not resize the card.
    rerender({ uri: 'wide-clip', post: 'p6' });
    await settle('square-clip', 1000, 1000);
    expect(result.current).toBe(DEFAULT_ASPECT);
    await settle('wide-clip', 2000, 1000);
    expect(result.current).toBe(2);
  });

  it('reads a clip measured by another card straight from the cache', async () => {
    const first = renderHook(() => useMediaAspect('shared-clip', 'p5'));
    await settle('shared-clip', 1000, 1000);
    first.unmount();
    const second = renderHook(() => useMediaAspect('shared-clip', 'p5'));
    expect(second.result.current).toBe(1);
  });
});
