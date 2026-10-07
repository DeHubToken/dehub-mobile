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

  it('lowers the original only once speech starts and restores it on completion', async () => {
    const { player } = await setup();
    expect(player.volume).toBe(0.8);
    expect(line().volume).toBe(0.8);
    act(() => line().onStart());
    expect(player.volume).toBeCloseTo(0.048);
    act(() => line().onDone());
    expect(player.volume).toBe(0.8);
    act(() => player.emit('timeUpdate', { currentTime: 0.5 }));
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it('restores the latest viewer volume on pause', async () => {
    const { player } = await setup();
    act(() => line().onStart());
    act(() => { player.volume = 0.5; });
    expect(player.volume).toBeCloseTo(0.03);
    act(() => { player.playing = false; player.emit('playingChange', { isPlaying: false }); });
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
});
