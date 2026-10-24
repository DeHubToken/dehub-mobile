import { act, renderHook, waitFor } from '@testing-library/react-native';
const mockSpeech = { stop: jest.fn(async () => {}), speak: jest.fn() };
const mockOriginal = { currentTime: 1, volume: 1 };
let mockPlayback = { spaceId: 'stage', paused: false, loading: false, position: 1, rate: 1 };
jest.mock('../../hooks/useCachedVideoDub', () => ({ useCachedVideoDub: () => ({ status: 'unavailable' }) }));
jest.mock('../../hooks/useVoiceDub', () => ({
  getSpeechEngine: () => mockSpeech,
  findVoice: async () => ({ identifier: 'spanish-voice' }),
  segmentIndexAt: (segments: any[], t: number) => segments.findIndex((s) => s.start <= t && s.end > t),
  speechRate: () => 1,
}));
jest.mock('../../libs/stage-playback', () => ({
  useStagePlayback: () => mockPlayback,
  getStagePlaybackState: () => mockPlayback,
  getStageRecordingPlayer: () => mockOriginal,
  pauseStageRecording: jest.fn(),
}));
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn() }));
import { useStageReplayDub } from '../../hooks/useStageReplayDub';
const lines = [{ start: 0, end: 4, text: 'Hola a todos' }, { start: 6, end: 10, text: 'Seguimos' }];
beforeEach(() => {
  jest.clearAllMocks(); mockPlayback = { spaceId: 'stage', paused: false, loading: false, position: 1, rate: 1 };
  mockOriginal.currentTime = 1; mockOriginal.volume = 1;
});
it('speaks the selected translation and follows pause and seek', async () => {
  const { result, rerender, unmount } = renderHook(() => useStageReplayDub('stage', 'transcript', 'es', lines));
  await waitFor(() => expect(result.current.ready).toBe(true));
  await waitFor(() => expect(mockSpeech.speak).toHaveBeenCalledWith('Hola a todos', expect.objectContaining({ language: 'es', voice: 'spanish-voice' })));
  expect(mockOriginal.volume).toBe(0);
  mockPlayback = { ...mockPlayback, paused: true };
  rerender({});
  expect(mockSpeech.stop).toHaveBeenCalled();
  mockOriginal.currentTime = 7;
  mockPlayback = { ...mockPlayback, paused: false, position: 7 };
  rerender({});
  await waitFor(() => expect(mockSpeech.speak).toHaveBeenCalledWith('Seguimos', expect.objectContaining({ language: 'es' })));
  unmount();
  expect(mockOriginal.volume).toBe(1);
});
it('does not speak original text while a selected translation is missing', async () => {
  const { result } = renderHook(() => useStageReplayDub('stage', 'transcript', 'es', null));
  await act(async () => {});
  expect(result.current.ready).toBe(false);
  expect(mockSpeech.speak).not.toHaveBeenCalled();
});
