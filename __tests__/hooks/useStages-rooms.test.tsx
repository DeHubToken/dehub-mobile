import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';

// Moving between stage rooms: the old seat is given up before the next join,
// a host is asked before their own stage comes down, a second tap does not race
// a second join, and the host's recording is uploaded on every way out.

const ME = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const space = (id: string, host: string) => ({
  id, host_wallet_address: host, host_username: null, host_avatar: null, title: `Stage ${id}`,
  description: null, status: 'live', channel_name: `stage_${id}`, listener_count: 0, speaker_count: 1,
  started_at: null, ended_at: null, created_at: '2026-10-22T00:00:00Z', recording_url: null,
  scheduled_at: null, cover_image_url: null, short_id: 1,
});
const mockRows: Record<string, ReturnType<typeof space>> = {
  mine: space('mine', ME),
  a: space('a', OTHER),
  b: space('b', OTHER),
};

const mockWrites: { table: string; op: string; payload: unknown; filters: unknown[][] }[] = [];
let mockInsertError: { code: string } | null = null;
jest.mock('../../services/supabase', () => {
  const query = (table: string) => {
    const state = { op: 'select', payload: undefined as unknown, filters: [] as unknown[][], one: false };
    const q: any = {};
    for (const op of ['insert', 'update', 'upsert', 'delete']) {
      q[op] = (payload: unknown) => { state.op = op; state.payload = payload; return q; };
    }
    for (const f of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte']) {
      q[f] = (...args: unknown[]) => { if (f === 'eq') state.filters.push(args); return q; };
    }
    q.single = q.maybeSingle = () => { state.one = true; return q; };
    q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      if (state.op !== 'select') mockWrites.push({ table, op: state.op, payload: state.payload, filters: state.filters });
      const id = state.filters.find(([k]) => k === 'id')?.[1] as string | undefined;
      const data = table === 'audio_spaces' && state.one && id ? mockRows[id] ?? null : state.one ? null : [];
      const error = state.op === 'insert' ? mockInsertError : null;
      return Promise.resolve({ data, error, count: 0 }).then(resolve, reject);
    };
    return q;
  };
  const channel = () => { const c: any = { on: () => c, subscribe: () => c }; return c; };
  return {
    fetchAgoraToken: jest.fn(async () => ({ token: 'token', uid: 0 })),
    supabase: {
      from: query,
      rpc: jest.fn(async () => ({ error: null })),
      channel,
      removeChannel: jest.fn(),
      functions: { invoke: jest.fn(async () => ({ data: null, error: null })) },
    },
  };
});
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { walletAddress: ME, username: 'me' } }) }));
jest.mock('../../config/agora.config', () => ({ AGORA_APP_ID: 'app' }));
jest.mock('../../config/env', () => ({ __esModule: true, default: { SUPABASE_URL: 'https://sb.test', SUPABASE_PUBLISHABLE_KEY: 'key' } }));
jest.mock('i18next', () => ({ __esModule: true, default: { t: (k: string) => k, language: 'en' }, t: (k: string) => k }));
jest.mock('../../libs/misc', () => ({ persistableAvatar: (u?: string | null) => u ?? null }));
const mockToastError = jest.fn();
jest.mock('../../libs/toast', () => ({ toastError: (...a: unknown[]) => mockToastError(...a), toastInfo: jest.fn() }));
jest.mock('../../libs/auth.utils', () => ({ getAuthToken: jest.fn() }));
jest.mock('../../libs/storage-upload', () => ({ storageWalletHeaders: jest.fn(async () => ({ 'x-wallet-address': ME, 'x-wallet-session': 'signed-fixture' })) }));
jest.mock('../../services/ai.service', () => ({ dehubAuthHeaders: jest.fn() }));
jest.mock('../../libs/supabase-wallet-client', () => ({ withWalletHeader: (q: unknown) => q }));
jest.mock('../../libs/stage-recording-delete', () => ({ deleteStageRecordings: jest.fn() }));
jest.mock('../../libs/openStagesHub', () => ({ openStagesHub: jest.fn() }));
jest.mock('../../libs/stage-broadcast', () => ({ watchStages: () => () => {} }));
jest.mock('../../hooks/useSuperpowers', () => ({ useFrontRow: () => ({ data: null }) }));
const mockAskToEnd = jest.fn();
jest.mock('../../components/Stages/confirmEndStage', () => ({ askToEndStage: (...a: unknown[]) => mockAskToEnd(...a) }));
const mockUpload = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 2048 })),
  uploadAsync: (...a: unknown[]) => mockUpload(...a),
  deleteAsync: jest.fn(async () => {}),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));
const mockEngine: Record<string, jest.Mock> = {};
jest.mock('react-native-agora', () => ({
  __esModule: true,
  default: () => mockEngine,
  ChannelProfileType: { ChannelProfileLiveBroadcasting: 1 },
  ClientRoleType: { ClientRoleBroadcaster: 1, ClientRoleAudience: 2 },
  AudioEffectPreset: { AudioEffectOff: 0 },
  RemoteVideoState: {},
  VideoStreamType: { VideoStreamLow: 1 },
  UserOfflineReasonType: {},
}));

import { useStages } from '../../hooks/useStages';

const ENGINE_METHODS = [
  'registerEventHandler', 'initialize', 'enableVideo', 'enableLocalVideo', 'muteLocalVideoStream',
  'setRemoteDefaultVideoStreamType', 'setChannelProfile', 'setClientRole', 'enableAudio',
  'enableAudioVolumeIndication', 'muteLocalAudioStream', 'joinChannel', 'leaveChannel',
  'startAudioRecording', 'stopAudioRecording', 'setAudioEffectPreset', 'stopAudioMixing', 'updateChannelMediaOptions',
];
beforeEach(() => {
  for (const m of ENGINE_METHODS) mockEngine[m] = jest.fn(() => 0);
  mockWrites.length = 0;
  mockInsertError = null;
  mockToastError.mockClear();
  mockAskToEnd.mockReset().mockResolvedValue(true);
  mockUpload.mockReset().mockResolvedValue({ status: 200, body: '' });
});
afterEach(cleanup);

const enter = async (result: { current: ReturnType<typeof useStages> }, id: string) => {
  let ok: boolean | undefined;
  await act(async () => { ok = await result.current.joinSpace(id); });
  return ok;
};
const leftSeat = (id: string) => mockWrites.some(
  (w) => w.table === 'space_participants' && w.op === 'update'
    && (w.payload as { left_at?: string }).left_at && w.filters.some(([k, v]) => k === 'space_id' && v === id),
);

it('uploads the host recording when the host leaves without pressing End', async () => {
  const { result } = renderHook(useStages);
  expect(await enter(result, 'mine')).toBe(true);
  expect(result.current.myRole).toBe('host');
  expect(mockEngine.startAudioRecording).toHaveBeenCalledTimes(1);
  await act(async () => { await result.current.leaveSpace(); });
  await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
  expect(mockUpload.mock.calls[0][0]).toBe('https://sb.test/storage/v1/object/stage-recordings/mine/recording.aac');
  expect(mockUpload.mock.calls[0][2].headers).toMatchObject({ 'x-wallet-address': ME, 'x-wallet-session': 'signed-fixture' });
});

it('uploads the recording once when the host presses End', async () => {
  const { result } = renderHook(useStages);
  await enter(result, 'mine');
  await act(async () => { await result.current.endSpace(); });
  await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
  expect(mockWrites.some((w) => w.table === 'audio_spaces' && (w.payload as { status?: string }).status === 'ended')).toBe(true);
});

it('leaves a host alone in their own room when they tap it again', async () => {
  const { result } = renderHook(useStages);
  await enter(result, 'mine');
  expect(await enter(result, 'mine')).toBe(true);
  expect(mockEngine.joinChannel).toHaveBeenCalledTimes(1);
  expect(mockEngine.startAudioRecording).toHaveBeenCalledTimes(1);
  expect(mockEngine.leaveChannel).not.toHaveBeenCalled();
  expect(mockAskToEnd).not.toHaveBeenCalled();
});

it('gives up the old seat before joining the next room', async () => {
  const { result } = renderHook(useStages);
  await enter(result, 'a');
  expect(result.current.myRole).toBe('listener');
  expect(await enter(result, 'b')).toBe(true);
  expect(leftSeat('a')).toBe(true);
  expect(mockEngine.leaveChannel).toHaveBeenCalledTimes(1);
  expect(mockEngine.joinChannel).toHaveBeenCalledTimes(2);
  expect(mockEngine.leaveChannel.mock.invocationCallOrder[0]).toBeLessThan(mockEngine.joinChannel.mock.invocationCallOrder[1]);
  expect(result.current.currentSpace?.id).toBe('b');
});

it('asks a host before taking their stage down to join another, and stays on a no', async () => {
  const { result } = renderHook(useStages);
  await enter(result, 'mine');
  mockAskToEnd.mockResolvedValueOnce(false);
  expect(await enter(result, 'a')).toBe(false);
  expect(mockEngine.leaveChannel).not.toHaveBeenCalled();
  expect(result.current.currentSpace?.id).toBe('mine');

  expect(await enter(result, 'a')).toBe(true);
  expect(mockAskToEnd).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
  expect(result.current.currentSpace?.id).toBe('a');
  expect(result.current.myRole).toBe('listener');
});

it('ignores a second tap while a join is still running', async () => {
  const { result } = renderHook(useStages);
  let first: Promise<boolean> | undefined;
  let second: boolean | undefined;
  await act(async () => {
    first = result.current.joinSpace('a');
    second = await result.current.joinSpace('b');
    await first;
  });
  expect(second).toBe(false);
  expect(await first).toBe(true);
  expect(mockEngine.joinChannel).toHaveBeenCalledTimes(1);
  expect(result.current.currentSpace?.id).toBe('a');
});

it('gives the seat back when the SDK refuses the join', async () => {
  mockEngine.joinChannel.mockReturnValue(-17);
  const { result } = renderHook(useStages);
  expect(await enter(result, 'a')).toBe(false);
  expect(leftSeat('a')).toBe(true);
  expect(result.current.isConnected).toBe(false);
  expect(result.current.currentSpace).toBeNull();
});

it('counts a hand already up as raised, and says so when the request never reached the host', async () => {
  const { result } = renderHook(useStages);
  await enter(result, 'a');
  mockInsertError = { code: '23505' };
  await act(async () => { await result.current.raiseHand(); });
  expect(result.current.hasRaisedHand).toBe(true);

  await act(async () => { await result.current.lowerHand(); });
  mockInsertError = { code: '42501' };
  await act(async () => { await result.current.raiseHand(); });
  expect(result.current.hasRaisedHand).toBe(false);
  expect(mockToastError).toHaveBeenCalledWith(null, 'common.somethingWentWrong');
});
