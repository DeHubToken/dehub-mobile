import { act, cleanup, renderHook } from '@testing-library/react-native';

jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
const mockInsert = jest.fn(); const mockToken = jest.fn(); const mockUpdate = jest.fn();
const mockCreate = jest.fn();
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { walletAddress: 'alice' } }) }));
jest.mock('../../config/agora.config', () => ({ AGORA_APP_ID: 'app' }));
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ warn: jest.fn(), error: jest.fn() }) }));
jest.mock('../../libs/api.client', () => ({ apiClient: { post: () => Promise.resolve() } }));
jest.mock('../../libs/audioFocus', () => ({ revokeAudioFocus: jest.fn() }));
jest.mock('../../libs/feedVideoFocus', () => ({ revokeAllFeedVideo: jest.fn() }));
jest.mock('../../services/supabase', () => ({
  fetchAgoraToken: (...args: unknown[]) => mockToken(...args),
  supabase: {
    from: () => ({
      insert: () => ({ select: () => ({ single: () => mockInsert() }) }),
      update: (data: unknown) => ({ eq: (field: string, id: string) => mockUpdate(data, field, id) }),
      select: () => { const q = { eq: () => q, order: () => q, limit: () => q, single: () => Promise.resolve({ data: null }) }; return q; },
    }),
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
    removeChannel: jest.fn(),
  },
}));
jest.mock('react-native-agora', () => ({
  __esModule: true, default: () => mockCreate(),
  VideoSourceType: { VideoSourceRemote: 0, VideoSourceCameraPrimary: 1 },
  RenderModeType: { RenderModeFit: 1, RenderModeHidden: 2 },
  ChannelProfileType: { ChannelProfileCommunication: 0 }, ClientRoleType: { ClientRoleBroadcaster: 1 },
}));
import { useCall } from '../../hooks/useCall';
import { visualActivity } from '../../libs/visualActivity';

const session = { id: 'call-1', caller_address: 'alice', recipient_address: 'bob', status: 'ringing', call_type: 'audio', created_at: new Date().toISOString() };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let handler: { onUserJoined: (...args: unknown[]) => void; onUserOffline: () => void };
let engine: Record<string, jest.Mock>;
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  engine = Object.fromEntries(['initialize', 'registerEventHandler', 'unregisterEventHandler', 'setChannelProfile', 'setClientRole', 'enableAudio', 'enableLocalAudio', 'muteLocalAudioStream', 'setDefaultAudioRouteToSpeakerphone', 'setEnableSpeakerphone', 'enableVideo', 'enableLocalVideo', 'startPreview', 'stopPreview', 'muteLocalVideoStream', 'joinChannel', 'leaveChannel', 'release', 'switchCamera'].map(name => [name, jest.fn(() => 0)]));
  engine.registerEventHandler.mockImplementation(h => { handler = h; });
  mockCreate.mockReturnValue(engine);
  mockInsert.mockResolvedValue({ data: session, error: null });
  mockToken.mockResolvedValue({ token: 'token', uid: 1 }); mockUpdate.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); visualActivity.setCall(false, false); jest.clearAllTimers(); jest.useRealTimers(); });

it('releases the camera, microphone and engine when the peer leaves, even if one teardown step throws', async () => {
  const { result } = renderHook(useCall);
  await act(async () => { await result.current.startCall('bob'); });
  act(() => { handler.onUserJoined({}, 42); });
  engine.stopPreview.mockImplementation(() => { throw new Error('preview already stopped'); });
  await act(async () => { handler.onUserOffline(); await Promise.resolve(); });
  expect(result.current.currentCall).toBeNull(); expect(result.current.remoteUid).toBeNull();
  expect(engine.enableLocalVideo).toHaveBeenCalledWith(false);
  expect(engine.enableLocalAudio).toHaveBeenCalledWith(false);
  expect(engine.leaveChannel).toHaveBeenCalledTimes(1);
  expect(engine.release).toHaveBeenCalledTimes(1);
  expect(mockUpdate).toHaveBeenCalledWith({ status: 'ended' }, 'id', session.id);
});

it('does not create an engine after credentials resolve for an ended call', async () => {
  const token = deferred<{ token: string; uid: number }>(); mockToken.mockReturnValue(token.promise);
  const { result } = renderHook(useCall);
  let starting!: Promise<void>;
  await act(async () => { starting = result.current.startCall('bob'); await Promise.resolve(); });
  await act(async () => { await result.current.endCall(); });
  await act(async () => { token.resolve({ token: 'late', uid: 1 }); await starting; });
  expect(mockCreate).not.toHaveBeenCalled(); expect(result.current.currentCall).toBeNull();
});

it('releases a failed join instead of leaving the call screen connecting', async () => {
  engine.joinChannel.mockReturnValue(-1);
  const { result } = renderHook(useCall);
  await act(async () => { await result.current.startCall('bob'); });
  expect(result.current.isConnecting).toBe(false);
  expect(result.current.currentCall).toBeNull();
  expect(engine.release).toHaveBeenCalledTimes(1);
  expect(mockUpdate).toHaveBeenCalledWith({ status: 'ended' }, 'id', session.id);
});

it('never starts a delayed camera preview after hangup', async () => {
  mockInsert.mockResolvedValue({ data: { ...session, call_type: 'video' }, error: null });
  const { result } = renderHook(useCall);
  let starting!: Promise<void>;
  await act(async () => { starting = result.current.startCall('bob', 'video'); for (let i = 0; i < 5; i++) await Promise.resolve(); });
  expect(mockCreate).toHaveBeenCalledTimes(1);
  await act(async () => { await result.current.endCall(); });
  await act(async () => { jest.advanceTimersByTime(300); await starting; });
  expect(engine.startPreview).not.toHaveBeenCalled();
  expect(engine.joinChannel).not.toHaveBeenCalled();
  expect(engine.release).toHaveBeenCalledTimes(1);
});

it('keeps the call provider still while the duration advances', async () => {
  let renders = 0;
  const { result } = renderHook(() => { renders++; return useCall(); });
  await act(async () => { await result.current.startCall('bob'); });
  act(() => { handler.onUserJoined({}, 42); });
  const startedAt = result.current.callStartedAt;
  await act(async () => { jest.advanceTimersByTime(1000); });
  const settledRenders = renders;
  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect(renders).toBe(settledRenders);
  expect(result.current.callStartedAt).toBe(startedAt);
  expect(result.current.isCallActive).toBe(true);
});
