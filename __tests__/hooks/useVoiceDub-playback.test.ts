import { act, cleanup, renderHook } from '@testing-library/react-native';
import type { VideoPlayer } from 'expo-video';
import * as Speech from 'expo-speech';
import { useVoiceDub } from '../../hooks/useVoiceDub';

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
  onStart: () => void; onDone: () => void; onError: () => void; volume: number;
};
async function setup() {
  const player = makePlayer();
  const hook = renderHook(() => useVoiceDub({ player: player as unknown as VideoPlayer, segments, lang: 'es', enabled: true }));
  await act(async () => {});
  return { player, ...hook };
}

describe('voice dub playback', () => {
  beforeEach(() => (Speech.speak as jest.Mock).mockClear());
  afterEach(cleanup);

  it('keeps the original quiet before speech, after completion and between lines', async () => {
    const { player } = await setup();
    expect(player.volume).toBeCloseTo(0.048);
    expect(line().volume).toBe(0.8);
    act(() => line().onStart());
    expect(player.volume).toBeCloseTo(0.048);
    act(() => line().onDone());
    expect(player.volume).toBeCloseTo(0.048);
    act(() => player.emit('timeUpdate', { currentTime: 0.5 }));
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    act(() => { player.currentTime = 3.5; player.emit('timeUpdate', { currentTime: 3.5 }); });
    expect(player.volume).toBeCloseTo(0.048);
    await act(async () => { player.currentTime = 4.1; player.emit('timeUpdate', { currentTime: 4.1 }); });
    expect(line().volume).toBe(0.8);
    expect(player.volume).toBeCloseTo(0.048);
  });

  it('keeps the original quiet on pause and restores the latest viewer volume on unmount', async () => {
    const { player, unmount } = await setup();
    act(() => line().onStart());
    act(() => { player.volume = 0.5; });
    expect(player.volume).toBeCloseTo(0.03);
    act(() => { player.playing = false; player.emit('playingChange', { isPlaying: false }); });
    expect(player.volume).toBeCloseTo(0.03);
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
    expect(player.volume).toBeCloseTo(0.048);
    unmount();
    expect(player.volume).toBe(0.8);
  });

  it('keeps the original quiet through seeking and restores it when dubbing is disabled', async () => {
    const player = makePlayer();
    const { rerender } = renderHook(({ enabled }) => useVoiceDub({
      player: player as unknown as VideoPlayer, segments, lang: 'es', enabled,
    }), { initialProps: { enabled: true } });
    await act(async () => {});
    act(() => { player.currentTime = 3.5; player.emit('timeUpdate', { currentTime: 3.5 }); });
    expect(player.volume).toBeCloseTo(0.048);
    rerender({ enabled: false });
    expect(player.volume).toBe(0.8);
  });

  it.each(['mute', 'zero volume'])('stops speech when the viewer selects %s', async (control) => {
    const { player, unmount } = await setup();
    act(() => line().onStart());
    act(() => {
      if (control === 'mute') { player.muted = true; player.emit('mutedChange', { muted: true }); }
      else player.volume = 0;
    });
    await act(async () => { player.currentTime = 4.1; player.emit('timeUpdate', { currentTime: 4.1 }); });
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(player.volume).toBeCloseTo(control === 'mute' ? 0.048 : 0);
    unmount();
    expect(player.volume).toBe(control === 'mute' ? 0.8 : 0);
  });
});
