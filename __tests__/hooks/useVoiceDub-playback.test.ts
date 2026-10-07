import { act, cleanup, renderHook } from '@testing-library/react-native';
import type { VideoPlayer } from 'expo-video';
import * as Speech from 'expo-speech';
import { useVoiceDub } from '../../hooks/useVoiceDub';
import { setVolume } from '../../libs/video-preferences';
import { DEFAULT_DUB_MIX, setDubMix, applyVideoVolume } from '../../libs/dub-mix';

jest.mock('expo-speech', () => ({
  speak: jest.fn(), stop: jest.fn(() => Promise.resolve()),
  getAvailableVoicesAsync: jest.fn(() => Promise.resolve([{ identifier: 'es', language: 'es-ES', quality: 'Enhanced' }])),
  VoiceQuality: { Enhanced: 'Enhanced' },
}), { virtual: true });

const segments = [{ start: 0, end: 3, text: 'Hola' }, { start: 4, end: 7, text: 'Adiós' }];
function makePlayer() {
  const listeners = new Map<string, Set<(payload: any) => void>>();
  let volume = 0.8;
  const player = {
    playing: true, muted: false, currentTime: 0.1, playbackRate: 1,
    get volume() { return volume; },
    set volume(next: number) { volume = next; player.emit('volumeChange', { volume: next }); },
    addListener(event: string, callback: (payload: any) => void) {
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set);
      set.add(callback);
      return { remove: () => set.delete(callback) };
    },
    emit(event: string, payload: any = {}) { listeners.get(event)?.forEach((callback) => callback(payload)); },
  };
  return player;
}
const line = () => (Speech.speak as jest.Mock).mock.calls.at(-1)![1] as {
  onStart: () => void; onDone: () => void; onError: () => void; onBoundary: (event: { charIndex: number }) => void; volume: number; useApplicationAudioSession: boolean;
};
async function setup() {
  const player = makePlayer();
  const hook = renderHook(() => useVoiceDub({ player: player as unknown as VideoPlayer, segments, lang: 'es', enabled: true }));
  await act(async () => {});
  return { player, ...hook };
}

describe('voice dub playback', () => {
  beforeEach(() => {
    (Speech.speak as jest.Mock).mockClear();
    setVolume(0.8);
    setDubMix(DEFAULT_DUB_MIX);
  });
  afterEach(() => { cleanup(); jest.useRealTimers(); });

  it('keeps the original quiet before speech, after completion and between lines', async () => {
    const { player } = await setup();
    expect(player.volume).toBeCloseTo(0.008);
    expect(line().volume).toBe(0.8);
    expect(line().useApplicationAudioSession).toBe(true);
    act(() => line().onStart());
    expect(player.volume).toBeCloseTo(0.008);
    act(() => line().onDone());
    expect(player.volume).toBeCloseTo(0.008);
    act(() => player.emit('timeUpdate', { currentTime: 0.5 }));
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    act(() => { player.currentTime = 3.5; player.emit('timeUpdate', { currentTime: 3.5 }); });
    expect(player.volume).toBeCloseTo(0.008);
    await act(async () => { player.currentTime = 4.1; player.emit('timeUpdate', { currentTime: 4.1 }); });
    expect(line().volume).toBe(0.8);
    expect(player.volume).toBeCloseTo(0.008);
  });

  it('keeps the original quiet on pause and restores the latest viewer volume on unmount', async () => {
    const { player, unmount } = await setup();
    act(() => line().onStart());
    act(() => setVolume(0.5));
    expect(player.volume).toBeCloseTo(0.005);
    act(() => { player.playing = false; player.emit('playingChange', { isPlaying: false }); });
    expect(player.volume).toBeCloseTo(0.005);
    unmount();
    expect(player.volume).toBe(0.5);
  });

  it('restores audio after a voice error and does not try subsequent lines', async () => {
    const { player } = await setup();
    act(() => line().onStart());
    act(() => line().onError());
    expect(player.volume).toBe(0.8);
    await act(async () => { player.currentTime = 4.1; player.emit('timeUpdate', { currentTime: 4.1 }); });
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it('ignores old speech callbacks and restores audio on unmount', async () => {
    const { player, unmount } = await setup();
    const first = line();
    act(() => first.onStart());
    await act(async () => { player.currentTime = 4.1; player.emit('timeUpdate', { currentTime: 4.1 }); });
    act(() => line().onStart());
    act(() => first.onDone());
    expect(player.volume).toBeCloseTo(0.008);
    unmount();
    expect(player.volume).toBe(0.8);
  });

  it('keeps the original quiet through seeking and restores it when dubbing is disabled', async () => {
    const player = makePlayer();
    const { rerender } = renderHook<void, { enabled: boolean }>(({ enabled }) => useVoiceDub({
      player: player as unknown as VideoPlayer, segments, lang: 'es', enabled,
    }), { initialProps: { enabled: true } });
    await act(async () => {});
    act(() => { player.currentTime = 3.5; player.emit('timeUpdate', { currentTime: 3.5 }); });
    expect(player.volume).toBeCloseTo(0.008);
    rerender({ enabled: false });
    expect(player.volume).toBe(0.8);
  });

  it.each(['mute', 'zero volume'])('stops speech when the viewer selects %s', async (control) => {
    const { player, unmount } = await setup();
    act(() => line().onStart());
    act(() => {
      if (control === 'mute') { player.muted = true; player.emit('mutedChange', { muted: true }); }
      else setVolume(0);
    });
    await act(async () => { player.currentTime = 4.1; player.emit('timeUpdate', { currentTime: 4.1 }); });
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(player.volume).toBeCloseTo(control === 'mute' ? 0.008 : 0);
    unmount();
    expect(player.volume).toBe(control === 'mute' ? 0.8 : 0);
  });

  it('prevents ordinary player writes from undoing the mix', async () => {
    const { player } = await setup();
    act(() => applyVideoVolume(player, 0.8));
    expect(player.volume).toBeCloseTo(0.008, 6);
    act(() => { player.volume = 1; });
    expect(player.volume).toBeCloseTo(0.008, 6);
    expect(line().volume).toBe(0.8);
  });

  it('silences the original without stopping or replaying the voice', async () => {
    const { player } = await setup();
    (Speech.stop as jest.Mock).mockClear();
    act(() => setDubMix({ original: 0 }));
    await act(async () => player.emit('timeUpdate', { currentTime: 0.5 }));
    expect(player.volume).toBe(0);
    expect(Speech.stop).not.toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    act(() => setDubMix({ original: 0.5 }));
    expect(player.volume).toBeCloseTo(0.2, 6);
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it('changes the active voice from its current word and mutes each track independently', async () => {
    jest.useFakeTimers();
    const { player } = await setup();
    act(() => line().onBoundary({ charIndex: 1 }));
    act(() => setDubMix({ voice: 0.5 }));
    await act(async () => jest.advanceTimersByTime(120));
    expect((Speech.speak as jest.Mock).mock.calls.at(-1)![0]).toBe('ola');
    expect(line().volume).toBeCloseTo(0.2, 6);
    expect(player.volume).toBeCloseTo(0.008, 6);
    act(() => setDubMix({ voice: 0 }));
    await act(async () => { jest.advanceTimersByTime(300); player.emit('timeUpdate', { currentTime: 0.5 }); });
    expect(Speech.speak).toHaveBeenCalledTimes(2);
    expect(player.volume).toBeCloseTo(0.008, 6);
    act(() => setDubMix({ voice: 1 }));
    await act(async () => jest.advanceTimersByTime(120));
    expect(line().volume).toBe(0.8);
    expect(Speech.speak).toHaveBeenCalledTimes(3);
  });

});
