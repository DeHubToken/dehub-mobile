const mockPlayer = {
  pause: jest.fn(), play: jest.fn(), replace: jest.fn(), setPlaybackRate: jest.fn(),
  addListener: jest.fn(), seekTo: jest.fn(), shouldCorrectPitch: false, volume: 1,
};
jest.mock('expo-audio', () => ({ createAudioPlayer: () => mockPlayer }));
jest.mock('i18next', () => {
  const t = (_key: string, o: any) => o?.defaultValue ?? '';
  return { __esModule: true, t, default: { t } };
});
jest.mock('../../libs/audioSession', () => ({ configureForBackgroundPlayback: jest.fn(async () => {}) }));
jest.mock('../../libs/lockScreen', () => ({ claimLockScreen: jest.fn(), releaseLockScreen: jest.fn() }));
jest.mock('../../libs/storage', () => ({ storage: { getString: () => undefined, set: jest.fn() } }));
jest.mock('../../libs/toast', () => ({ toastError: jest.fn(), toastInfo: jest.fn() }));
const mockInvoke = jest.fn();
jest.mock('../../services/supabase', () => ({ supabase: {
  functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  rpc: () => Promise.resolve({ error: null }),
  from: () => { const q: any = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: null }) }; return q; },
} }));
import { Platform } from 'react-native';
import { playStageRecording, stopStageRecording } from '../../libs/stage-playback';
import { toastError } from '../../libs/toast';
const original = 'https://media.test/recording.webm';
const converted = 'https://media.test/recording.m4a';
const stage = (id: string, url = original) => ({ id, title: 'Town Hall', recording_url: url });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => stopStageRecording());

it.each(['ios', 'android'])('uses the converted AAC recording on %s without polling', async (platform) => {
  (Platform as { OS: string }).OS = platform;
  mockInvoke.mockResolvedValue({ data: { ok: true, recordingUrl: converted }, error: null });
  playStageRecording(stage(platform));
  await flush();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: converted });
  expect(mockPlayer.play).toHaveBeenCalled();
});
it('does not resurrect a recording stopped during conversion', async () => {
  let finish!: (value: unknown) => void;
  mockInvoke.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  playStageRecording(stage('stopped'));
  await flush();
  stopStageRecording();
  finish({ data: { ok: true, recordingUrl: converted }, error: null });
  await flush();
  expect(mockPlayer.replace).not.toHaveBeenCalledWith({ uri: converted });
  expect(mockPlayer.play).not.toHaveBeenCalled();
});
it('surfaces conversion failure instead of leaving a loading spinner', async () => {
  mockInvoke.mockResolvedValue({ data: { ok: false, error: 'worker busy' }, error: null });
  playStageRecording(stage('failed'));
  await flush();
  expect(toastError).toHaveBeenCalled();
  expect(mockPlayer.play).not.toHaveBeenCalled();
});
it('plays a finalized recording without invoking conversion', async () => {
  playStageRecording(stage('ready', converted));
  await flush();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: converted });
});
