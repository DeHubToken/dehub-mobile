import { useState, useCallback, useEffect } from "react";
import { toastError, toastInfo } from '../libs';
import { useAppKit, useAppKitAccount } from "@reown/appkit-ethers5-react-native";
import { useAuth } from "../context/AuthContext";
import { ChainId, isDevMode } from "../config/constants";

const getPreferredChainId = () =>
  isDevMode ? ChainId.GORLI : ChainId.BASE_MAINNET;

const isSupportedChain = (chainId: number): boolean => {
  const supportedChains = isDevMode
    ? [ChainId.GORLI, ChainId.BSC_TESTNET]
    : [ChainId.BSC_MAINNET, ChainId.BASE_MAINNET];
  return supportedChains.includes(chainId);
};

const getChainName = (chainId: number): string => {
  const chainNames: Record<number, string> = {
    [ChainId.GORLI]: "Goerli Testnet",
    [ChainId.BSC_MAINNET]: "BNB Chain",
    [ChainId.BSC_TESTNET]: "BNB Testnet",
    [ChainId.BASE_MAINNET]: "Base",
  };
  return chainNames[chainId] || `Chain ID ${chainId}`;
};

export const useWalletAuth = (_navigation: any) => {
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const { open } = useAppKit();
  const { address: accountAddress, chainId: currentChainId, isConnected } = useAppKitAccount();
  const { signInWithWallet } = useAuth();

  // Keep local state in sync with AppKit account
  useEffect(() => {
    setWalletAddress(accountAddress ?? null);
    // If no account, ensure loading is not shown
    if (!accountAddress) setIsWalletLoading(false);
  }, [accountAddress]);

  const authenticateWithWallet = useCallback(
    async (address: string, chainId: number) => {
      try {
        await signInWithWallet(address, chainId);
      } catch (error) {
  console.error('[WalletAuth] authentication error', error);
  toastError(error, 'Wallet authentication failed. Please try again.');
      }
    },
    [signInWithWallet]
  );

  const handleWalletConnect = useCallback(async () => {
    // If already connected, authenticate immediately
    if (accountAddress && currentChainId) {
      setIsWalletLoading(true);
      await authenticateWithWallet(accountAddress, currentChainId);
      setIsWalletLoading(false);
      return;
    }

    // Open AppKit modal without toggling loading yet
    open();
  }, [accountAddress, currentChainId, open, authenticateWithWallet]);

  // When account and chain become available (user finished connection)
  useEffect(() => {
  if (!accountAddress || !currentChainId) return;

    const proceed = async () => {
      setIsWalletLoading(true);
  const chainId = currentChainId;

      if (isSupportedChain(chainId)) {
  await authenticateWithWallet(accountAddress, chainId);
        setIsWalletLoading(false);
      } else {
        const preferredChainId = getPreferredChainId();
        const preferredChainName = getChainName(preferredChainId);

    console.warn('[WalletAuth] wrong network', { current: chainId, preferred: preferredChainId });
  toastInfo(`Switch to ${preferredChainName} to continue.`);
    // Auto switch not available through useAppKitAccount; prompt user manually
    toastInfo('Open your wallet and change network.');
    setIsWalletLoading(false);
      }
    };

    proceed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountAddress, currentChainId]);

  return {
    isWalletLoading,
    walletAddress,
    handleWalletConnect,
  };
};
