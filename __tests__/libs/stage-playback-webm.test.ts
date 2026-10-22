// Stages hosted from a browser were recorded as WebM, which an iPhone cannot
// play. The first play asks the server for an MP4 copy; an iPhone waits for it,
// Android plays the WebM meanwhile, and a copy that never comes is a clear
// "could not be played" instead of a spinner.

const mockPlayer = {
  pause: jest.fn(), play: jest.fn(), replace: jest.fn(), setPlaybackRate: jest.fn(),
  addListener: jest.fn(), seekTo: jest.fn(), shouldCorrectPitch: false,
};
jest.mock('expo-audio', () => ({ createAudioPlayer: () => mockPlayer }));
jest.mock('i18next', () => ({ __esModule: true, default: { t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? '' } }));
jest.mock('../../libs/audioSession', () => ({ configureForBackgroundPlayback: jest.fn(async () => {}) }));
jest.mock('../../libs/lockScreen', () => ({ claimLockScreen: jest.fn(), releaseLockScreen: jest.fn() }));
jest.mock('../../libs/storage', () => ({ storage: { getString: () => undefined, set: jest.fn() } }));
jest.mock('../../libs/toast', () => ({ toastError: jest.fn(), toastInfo: jest.fn() }));
const mockInvoke = jest.fn();
let mockRecordingUrl: string | null = null;
jest.mock('../../services/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    rpc: () => Promise.resolve({ error: null }),
    from: () => {
      const q: any = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: { recording_url: mockRecordingUrl } }) };
      return q;
    },
  },
}));

import { Platform } from 'react-native';
import { toastError } from '../../libs/toast';
import { playStageRecording, stopStageRecording } from '../../libs/stage-playback';

const WEBM = 'https://sb.test/storage/v1/object/public/stage-recordings/s1/recording.webm';
const MP4 = 'https://sb.test/storage/v1/object/public/stage-recordings/s1/recording.mp4';
const stage = (id: string, recording_url: string) => ({ id, title: 'Town Hall', recording_url, started_at: null, ended_at: null });
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockInvoke.mockResolvedValue({ data: null, error: null });
  mockRecordingUrl = WEBM;
  (Platform as { OS: string }).OS = 'ios';
});
afterEach(() => { stopStageRecording(); jest.useRealTimers(); });

it('waits on an iPhone for the MP4 copy and plays that', async () => {
  playStageRecording(stage('s1', WEBM) as never);
  expect(mockInvoke).toHaveBeenCalledWith('finalize-stage-recording', { body: { stageId: 's1', transcribe: false } });
  await jest.advanceTimersByTimeAsync(2000);
  expect(mockPlayer.replace).not.toHaveBeenCalled();
  mockRecordingUrl = MP4;
  await jest.advanceTimersByTimeAsync(2000);
  await flush();
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: MP4 });
  expect(mockPlayer.play).toHaveBeenCalled();
});

it('says so on an iPhone when no copy arrives in time', async () => {
  playStageRecording(stage('s2', WEBM) as never);
  await jest.advanceTimersByTimeAsync(92_000);
  await flush();
  // Only the release of the old source, never the WebM itself.
  expect(mockPlayer.replace.mock.calls).toEqual([[null]]);
  expect(toastError).toHaveBeenCalledWith(null, 'That recording could not be played');
});

it('plays the WebM straight away on Android while the copy is made', async () => {
  (Platform as { OS: string }).OS = 'android';
  playStageRecording(stage('s3', WEBM) as never);
  await flush();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: WEBM });
});

it('asks nothing for a recording that is already MP4', async () => {
  playStageRecording(stage('s4', MP4) as never);
  await flush();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: MP4 });
});
