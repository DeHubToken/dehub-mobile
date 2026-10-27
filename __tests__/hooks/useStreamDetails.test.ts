import { act, renderHook } from '@testing-library/react-native';
import { useStreamDetails } from '../../hooks/useStreamDetails';
import { getLiveStream, getStreamKey } from '../../services/live.service';
jest.mock('../../services/live.service', () => ({ getLiveStream: jest.fn(), getStreamKey: jest.fn() }));
jest.mock('../../libs/live-status', () => ({ streamRefreshInterval: () => null }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, args: any) => args.defaultValue }) }));

it('ignores an old stream key and its loading completion after switching streams', async () => {
  (getLiveStream as jest.Mock).mockResolvedValue({});
  let first!: (value: unknown) => void, second!: (value: unknown) => void;
  (getStreamKey as jest.Mock).mockReturnValueOnce(new Promise(done => { first = done; }))
    .mockReturnValueOnce(new Promise(done => { second = done; }));
  const { result, rerender } = renderHook<ReturnType<typeof useStreamDetails>, { id: string; key: boolean }>(({ id, key }) => useStreamDetails(id, key), { initialProps: { id: 'first', key: true } });
  rerender({ id: 'second', key: true });
  await act(async () => { first({ streamKey: 'old' }); });
  expect(result.current.streamKeyValue).toBeNull();
  expect(result.current.streamKeyLoading).toBe(true);
  await act(async () => { second({ streamKey: 'new' }); });
  expect(result.current.streamKeyValue).toBe('new');
  expect(result.current.streamKeyLoading).toBe(false);
  rerender({ id: 'second', key: false });
  expect(result.current.streamKeyValue).toBeNull();
  expect(result.current.streamKeyLoading).toBe(false);
});

it('keeps retrying a failed read and keeps the last stream it had', async () => {
  jest.useFakeTimers();
  (getLiveStream as jest.Mock).mockReset()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({ result: { _id: 's', status: 'LIVE' } })
    .mockResolvedValueOnce(null);
  const { result } = renderHook(() => useStreamDetails('s', false));
  await act(async () => {});
  expect(result.current.streamEntity).toBeNull();
  await act(async () => { jest.advanceTimersByTime(2_000); });
  expect(result.current.streamEntity).toEqual({ _id: 's', status: 'LIVE' });
  await act(async () => { result.current.refetchStream(true); });
  expect(result.current.streamEntity).toEqual({ _id: 's', status: 'LIVE' });
  jest.useRealTimers();
});
