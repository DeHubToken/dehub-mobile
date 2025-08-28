import { useState, useCallback, useEffect } from "react";
import { Alert } from "react-native";
import { useAppKit } from "@reown/appkit-ethers5-react-native";
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
  const { open, account, connector } = useAppKit();
  const { signInWithWallet } = useAuth();

  // Keep local state in sync with AppKit account
  useEffect(() => {
    setWalletAddress(account?.address ?? null);
    // If no account, ensure loading is not shown
    if (!account?.address) setIsWalletLoading(false);
  }, [account?.address]);

  const authenticateWithWallet = useCallback(
    async (address: string, chainId: number) => {
      try {
        await signInWithWallet(address, chainId);
      } catch (error) {
        console.error("Wallet authentication error:", error);
        Alert.alert(
          "Authentication Failed",
          "Failed to authenticate with your wallet. Please try again."
        );
      }
    },
    [signInWithWallet]
  );

  const handleWalletConnect = useCallback(async () => {
    // If already connected, authenticate immediately
    if (account?.address && connector?.chainId) {
      setIsWalletLoading(true);
      await authenticateWithWallet(account.address, connector.chainId);
      setIsWalletLoading(false);
      return;
    }

    // Open AppKit modal without toggling loading yet
    open();
  }, [account?.address, connector?.chainId, open, authenticateWithWallet]);

  // When account and chain become available (user finished connection)
  useEffect(() => {
    if (!account?.address || !connector?.chainId) return;

    const proceed = async () => {
      setIsWalletLoading(true);
      const chainId = connector.chainId;

      if (isSupportedChain(chainId)) {
        await authenticateWithWallet(account.address, chainId);
        setIsWalletLoading(false);
      } else {
        const preferredChainId = getPreferredChainId();
        const preferredChainName = getChainName(preferredChainId);

        Alert.alert(
          "Wrong Network",
          `Please switch to ${preferredChainName} to continue.`,
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => setIsWalletLoading(false),
            },
            {
              text: "Switch Network",
              onPress: async () => {
                try {
                  // Ask wallet to switch network via connector
                  await connector.switchChain({ chainId: preferredChainId });
                  // If switched, try auth
                  if (connector?.chainId === preferredChainId) {
                    await authenticateWithWallet(
                      account.address,
                      preferredChainId
                    );
                  }
                } catch (e) {
                  console.error("Chain switch error:", e);
                  Alert.alert(
                    "Network Switch Failed",
                    "Failed to switch networks. Please try again or switch manually."
                  );
                } finally {
                  setIsWalletLoading(false);
                }
              },
            },
          ]
        );
      }
    };

    proceed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address, connector?.chainId]);

  return {
    isWalletLoading,
    walletAddress,
    handleWalletConnect,
  };
};
