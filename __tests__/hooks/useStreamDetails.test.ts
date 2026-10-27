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
