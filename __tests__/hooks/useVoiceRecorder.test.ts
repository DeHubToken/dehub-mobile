import { act, cleanup, renderHook } from '@testing-library/react-native';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { releaseRecording } from '../../libs/audioSession';
import { runWithPermissions } from '../../libs/permissions.util';

const mockRecorder = {
  uri: 'file:///voice.m4a',
  prepareToRecordAsync: jest.fn(async () => {}),
  record: jest.fn(),
  stop: jest.fn(async () => {}),
  getStatus: jest.fn(() => ({ isRecording: true, durationMillis: 1200, metering: -20 })),
};
jest.mock('expo-audio', () => ({ useAudioRecorder: () => mockRecorder, RecordingPresets: { HIGH_QUALITY: {} } }));
jest.mock('../../libs/audioSession', () => ({ configureForRecording: jest.fn(async () => {}), releaseRecording: jest.fn(async () => {}) }));
jest.mock('../../libs/permissions.util', () => ({ runWithPermissions: jest.fn(async (_permissions, run) => run()) }));

function setup() {
  const callbacks = { onRecordingComplete: jest.fn(), onCancel: jest.fn() };
  return { callbacks, ...renderHook(() => useVoiceRecorder(callbacks)) };
}
beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => { cleanup(); jest.useRealTimers(); });

it('completes a native recording once when stop and the timer race', async () => {
  const { result, callbacks } = setup();
  await act(async () => result.current.startRecording());
  await act(async () => { await Promise.all([result.current.stopRecording(), result.current.stopRecording()]); });
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(callbacks.onRecordingComplete).toHaveBeenCalledWith({ uri: 'file:///voice.m4a', durationMs: 1200, mimeType: 'audio/m4a' });
  expect(releaseRecording).toHaveBeenCalledTimes(1);
  expect(result.current.isRecording).toBe(false);
});

it('recovers the composer and audio session after the native stop fails', async () => {
  mockRecorder.stop.mockRejectedValueOnce(new Error('recorder failed'));
  const { result, callbacks } = setup();
  await act(async () => result.current.startRecording());
  await act(async () => result.current.stopRecording());
  expect(result.current.isRecording).toBe(false);
  expect(result.current.isStopping).toBe(false);
  expect(callbacks.onRecordingComplete).not.toHaveBeenCalled();
  expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
  expect(releaseRecording).toHaveBeenCalled();
  await act(async () => result.current.startRecording());
  expect(result.current.isRecording).toBe(true);
});

it('does not start after the permission prompt outlives the composer', async () => {
  let permit!: () => void;
  (runWithPermissions as jest.Mock).mockImplementationOnce((_permissions, run) => new Promise<void>(resolve => {
    permit = () => { run(); resolve(); };
  }));
  const { result, unmount, callbacks } = setup();
  let pending!: Promise<void>;
  act(() => { pending = result.current.startRecording(); });
  unmount();
  await act(async () => { permit(); await pending; });
  expect(mockRecorder.record).not.toHaveBeenCalled();
  expect(callbacks.onRecordingComplete).not.toHaveBeenCalled();
});

it('cancels instead of sending if dismissed while stop is pending', async () => {
  let stopped!: () => void;
  mockRecorder.stop.mockImplementationOnce(() => new Promise<void>(resolve => { stopped = resolve; }));
  const { result, callbacks } = setup();
  await act(async () => result.current.startRecording());
  let pending!: Promise<void>;
  act(() => { pending = result.current.stopRecording(); });
  await act(async () => { await result.current.cancelRecording(); stopped(); await pending; });
  expect(callbacks.onRecordingComplete).not.toHaveBeenCalled();
  expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
});

it('automatically ends live-chat and comment recordings before 30 seconds', async () => {
  const { result, callbacks } = setup();
  await act(async () => result.current.startRecording());
  await act(async () => { jest.advanceTimersByTime(29_100); });
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(callbacks.onRecordingComplete).toHaveBeenCalledTimes(1);
  expect(result.current.isRecording).toBe(false);
});
