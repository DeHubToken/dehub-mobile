import { act, renderHook } from '@testing-library/react-native';
import type { VideoPlayer } from 'expo-video';
import { usePlaybackRecovery } from '../../hooks/usePlaybackRecovery';
jest.mock('../../libs/errorReporter', () => ({ reportError: jest.fn() }));

describe('native playback recovery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
  const setup = () => {
    const events = new Map<string, (event: any) => void>();
    const player = {
      currentTime: 0, duration: 60, status: 'readyToPlay', playing: false,
      play: jest.fn(), pause: jest.fn(), replaceAsync: jest.fn().mockResolvedValue(undefined),
      addListener: jest.fn((name: string, listener: (event: any) => void) => { events.set(name, listener); return { remove: () => events.delete(name) }; }),
    };
    return { player, events };
  };
  it('reloads source errors and clears failure after a manual retry produces progress', async () => {
    const { player, events } = setup();
    const { result } = renderHook(() => usePlaybackRecovery(player as unknown as VideoPlayer, 'clip', { component: 'Test', allowed: () => true }));
    await act(async () => result.current.recovery.start());
    await act(async () => events.get('statusChange')?.({ status: 'error' }));
    expect(player.replaceAsync).toHaveBeenCalledWith('clip');
    await act(async () => events.get('statusChange')?.({ status: 'error' }));
    expect(result.current.phase).toBe('failed');
    await act(async () => result.current.recovery.start());
    player.playing = true;
    act(() => events.get('timeUpdate')?.({ currentTime: 0.25 }));
    expect(result.current.phase).toBe('playing');
  });
  it('cannot restart from a late replacement after the user pauses', async () => {
    const { player } = setup();
    let finish!: () => void;
    player.replaceAsync.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const { result } = renderHook(() => usePlaybackRecovery(player as unknown as VideoPlayer, 'clip', { component: 'Test', allowed: () => true }));
    act(() => { result.current.recovery.start(); result.current.recovery.fail(); result.current.recovery.stop(); });
    await act(async () => finish());
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
  });
});
