import { act, cleanup, renderHook } from '@testing-library/react-native';
import type { VideoPlayer } from 'expo-video';
import { createAudioPlayer } from 'expo-audio';
import { useCachedDubAudio } from '../../hooks/useCachedDubAudio';
import { setVolume } from '../../libs/video-preferences';
import { DEFAULT_DUB_MIX, setDubMix } from '../../libs/dub-mix';

jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn() }));

function emitter() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addListener(event: string, callback: () => void) {
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set);
      set.add(callback);
      return { remove: () => set.delete(callback) };
    },
    emit(event: string) { listeners.get(event)?.forEach((callback) => callback()); },
  };
}
function setup() {
  const audio = {
    ...emitter(), isLoaded: true, currentTime: 0, playbackRate: 1, volume: 1, playing: false,
    play: jest.fn(() => { audio.playing = true; }),
    pause: jest.fn(() => { audio.playing = false; }),
    seekTo: jest.fn(async (time: number) => { audio.currentTime = time; }),
    setPlaybackRate: jest.fn((rate: number) => { audio.playbackRate = rate; }), remove: jest.fn(),
  };
  (createAudioPlayer as jest.Mock).mockReturnValue(audio);
  const player = { ...emitter(), playing: true, muted: false, currentTime: 0, playbackRate: 1, volume: 0.8, status: 'readyToPlay' };
  const failed = jest.fn();
  const hook = renderHook(() => useCachedDubAudio(player as unknown as VideoPlayer, 'https://example.test/voice.m4a', failed));
  return { audio, player, failed, ...hook };
}
beforeEach(() => { setVolume(0.8); setDubMix(DEFAULT_DUB_MIX); });
afterEach(cleanup);

it('mixes independent tracks, follows seek and pause, and restores original on unmount', async () => {
  const { audio, player, unmount } = setup();
  expect(audio.volume).toBe(0.8);
  expect(player.volume).toBeCloseTo(0.008);
  await act(async () => { player.currentTime = 8; player.emit('timeUpdate'); });
  expect(audio.seekTo).toHaveBeenCalledWith(8);
  act(() => { player.playing = false; player.emit('playingChange'); });
  expect(audio.playing).toBe(false);
  expect(player.volume).toBeCloseTo(0.008);
  act(() => setDubMix({ voice: 0.5, original: 0.3 }));
  expect(audio.volume).toBeCloseTo(0.2);
  expect(player.volume).toBeCloseTo(0.072);
  unmount();
  expect(audio.remove).toHaveBeenCalled();
  expect(player.volume).toBe(0.8);
});

it('does not restart audio when paused during an asynchronous seek', async () => {
  const { audio, player } = setup();
  let finish!: () => void;
  audio.seekTo.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  act(() => { player.currentTime = 10; player.emit('timeUpdate'); });
  act(() => { player.playing = false; player.emit('playingChange'); });
  await act(async () => finish());
  expect(audio.playing).toBe(false);
});
