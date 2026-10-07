import { act, renderHook } from '@testing-library/react-native';
import { useSettledVideoSource } from '../../hooks/useSettledVideoSource';

describe('settled video preloading', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reports a rejected active source so recovery can reload the unchanged URL', async () => {
    const player = { replaceAsync: jest.fn().mockRejectedValue(new Error('offline')) };
    const error = jest.fn();
    renderHook(() => useSettledVideoSource(player, 'clip', true, jest.fn(), error));
    await act(async () => {});
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('serializes a slow preload before attaching the newly active source', async () => {
    let finish!: () => void;
    const player = { replaceAsync: jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined) };
    const ready = jest.fn();
    const { rerender } = renderHook<void, { source: string }>(({ source }) => useSettledVideoSource(player, source, true, ready), { initialProps: { source: 'old' } });
    rerender({ source: 'new' });
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(player.replaceAsync.mock.calls).toEqual([['old'], ['new']]);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('cancels skipped neighbours and unloads retained distant cells', async () => {
    const player = { replaceAsync: jest.fn().mockResolvedValue(undefined) };
    const ready = jest.fn();
    const { rerender } = renderHook<void, { source: string | null; active: boolean }>(({ source, active }) =>
      useSettledVideoSource(player, source, active, ready),
      { initialProps: { source: 'first' as string | null, active: false } });
    act(() => jest.advanceTimersByTime(200));
    rerender({ source: 'second', active: false });
    act(() => jest.advanceTimersByTime(400));
    expect(player.replaceAsync.mock.calls).toEqual([['second']]);
    rerender({ source: 'second', active: true });
    await act(async () => {});
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(1);
    rerender({ source: null, active: false });
    expect(player.replaceAsync).toHaveBeenLastCalledWith(null);
  });

  it('does not restart a departed page when loading finishes', async () => {
    let resolveLoad!: () => void;
    const player = { replaceAsync: jest.fn(() => new Promise<void>(resolve => { resolveLoad = resolve; })) };
    const ready = jest.fn();
    const { rerender } = renderHook<void, { active: boolean }>(({ active }) =>
      useSettledVideoSource(player, 'clip', active, ready), { initialProps: { active: true } });
    rerender({ active: false });
    await act(async () => resolveLoad());
    expect(ready).not.toHaveBeenCalled();
  });
});
