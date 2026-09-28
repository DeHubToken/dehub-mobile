import React from 'react';
import { act, create } from 'react-test-renderer';
import { useWalletAuth } from '../../hooks/useWalletAuth';

const mockSignIn = jest.fn();
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('../../context/AuthContext', () => ({ useAuthActions: () => ({ signInWithWallet: mockSignIn }) }));
jest.mock('../../libs', () => ({ toastError: jest.fn() }));
jest.mock('../../libs/walletSignupGate', () => ({ reportWalletSignupBlocked: () => false }));
jest.mock('../../libs/auth.utils', () => ({ getPreferredChainId: async () => 8453 }));
jest.mock('../../config/reown.config', () => ({ getAppKitInstance: () => null }));
jest.mock('../../libs/provider.registry', () => ({ setSigningProvider: jest.fn(), clearSigningProvider: jest.fn() }));
jest.mock('@reown/appkit-ethers5-react-native', () => ({
  useAppKitAccount: () => ({ address: '0x1111111111111111111111111111111111111111', chainId: 8453 }),
  useAppKitProvider: () => ({ walletProvider: { request: jest.fn() } }),
}));

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
