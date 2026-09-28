import React from 'react';
import { act, create } from 'react-test-renderer';
import { useWalletAuth } from '../../hooks/useWalletAuth';

const mockSignIn = jest.fn();
const mockKit = {
  open: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  getState: () => ({ open: false }),
  subscribeStateKey: () => () => {},
};
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('../../context/AuthContext', () => ({ useAuthActions: () => ({ signInWithWallet: mockSignIn }) }));
jest.mock('../../libs', () => ({ toastError: jest.fn() }));
jest.mock('../../libs/walletSignupGate', () => ({ reportWalletSignupBlocked: () => false }));
jest.mock('../../libs/auth.utils', () => ({ getPreferredChainId: async () => 8453 }));
jest.mock('../../config/reown.config', () => ({ getAppKitInstance: () => mockKit }));
jest.mock('../../libs/provider.registry', () => ({ setSigningProvider: jest.fn(), clearSigningProvider: jest.fn() }));
jest.mock('@reown/appkit-ethers5-react-native', () => ({
  useAppKitAccount: () => ({ address: '0x1111111111111111111111111111111111111111', chainId: 8453 }),
  useAppKitProvider: () => ({ walletProvider: { request: jest.fn() } }),
}));

beforeEach(() => { jest.clearAllMocks(); mockSignIn.mockReset(); });

it('keeps repeated connect taps and provider updates to one login at a time', async () => {
  let finish!: () => void;
  mockSignIn.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  let wallet!: ReturnType<typeof useWalletAuth>;
  function Screen() { wallet = useWalletAuth(); return null; }
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<Screen />); });
  let first!: Promise<void>;
  await act(async () => {
    first = wallet.handleWalletConnect();
    await wallet.handleWalletConnect();
  });
  expect(mockSignIn).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); await first; });
  expect(wallet.isWalletLoading).toBe(false);
  await act(async () => { root.unmount(); });
});

it.each(['Failed to publish payload, please try again. id:1 tag:1108', 'Wallet signature timed out'])('reopens the wallet picker after %s', async message => {
  mockSignIn.mockRejectedValue(new Error(message));
  let wallet!: ReturnType<typeof useWalletAuth>;
  function Screen() { wallet = useWalletAuth(); return null; }
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<Screen />); });
  await act(async () => { await wallet.handleWalletConnect(); });
  expect(wallet.isWalletLoading).toBe(false);
  expect(mockKit.disconnect).not.toHaveBeenCalled();
  await act(async () => { await wallet.handleWalletConnect(); });
  expect(mockKit.disconnect).toHaveBeenCalledTimes(1);
  expect(mockKit.open).toHaveBeenCalledTimes(1);
  expect(mockSignIn).toHaveBeenCalledTimes(1);
  await act(async () => { root.unmount(); });
});

it('keeps the pairing after a user rejects signing', async () => {
  mockSignIn.mockRejectedValue(new Error('User rejected'));
  let wallet!: ReturnType<typeof useWalletAuth>;
  function Screen() { wallet = useWalletAuth(); return null; }
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<Screen />); });
  await act(async () => { await wallet.handleWalletConnect(); });
  await act(async () => { await wallet.handleWalletConnect(); });
  expect(mockKit.disconnect).not.toHaveBeenCalled();
  expect(mockSignIn).toHaveBeenCalledTimes(2);
  await act(async () => { root.unmount(); });
});
