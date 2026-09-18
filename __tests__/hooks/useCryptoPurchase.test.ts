import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCryptoPurchase, type PurchaseApi } from '../../hooks/useCryptoPurchase';

const asset = { assetId: 'btc', blockchain: 'btc', symbol: 'BTC', decimals: 8 };
const service = (): PurchaseApi => ({
  assets: jest.fn().mockResolvedValue([asset]), list: jest.fn().mockResolvedValue([]),
  quote: jest.fn(), create: jest.fn(), status: jest.fn(),
});

it('loads currencies when the buy screen becomes focused', async () => {
  const api = service();
  const { result, rerender, unmount } = renderHook<ReturnType<typeof useCryptoPurchase>, { active: boolean }>(({ active }) => useCryptoPurchase(api, 'wallet', 50000, active), { initialProps: { active: false } });
  expect(result.current.loading).toBe(false);
  expect(api.assets).not.toHaveBeenCalled();
  rerender({ active: true });
  await waitFor(() => expect(result.current.assets).toEqual([asset]));
  expect(result.current.loading).toBe(false);
  rerender({ active: false });
  rerender({ active: true });
  await waitFor(() => expect(api.assets).toHaveBeenCalledTimes(2));
  unmount();
});

it('does not stay loading before the wallet is ready', async () => {
  const api = service();
  const { result, rerender, unmount } = renderHook<ReturnType<typeof useCryptoPurchase>, { wallet: string }>(({ wallet }) => useCryptoPurchase(api, wallet, 50000, true), { initialProps: { wallet: '' } });
  expect(result.current.loading).toBe(false);
  expect(api.assets).not.toHaveBeenCalled();
  rerender({ wallet: 'wallet' });
  await waitFor(() => expect(result.current.assets).toEqual([asset]));
  unmount();
});

it('ends loading on failure and recovers on retry', async () => {
  const api = service();
  (api.assets as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const { result, unmount } = renderHook(() => useCryptoPurchase(api, 'wallet', 50000, true));
  await waitFor(() => expect(result.current.assetsFailed).toBe(true));
  expect(result.current.loading).toBe(false);
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.assets).toEqual([asset]));
  expect(result.current.assetsFailed).toBe(false);
  unmount();
});
