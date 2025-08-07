import { Alert } from 'react-native';
import { AccountController, ConnectorController } from '@reown/appkit-core-react-native';
import { ChainId, isDevMode } from '../config/constants';

interface WalletConnectionResult {
  address: string;
  chainId: number;
  isSuccess: boolean;
  error?: string;
}

const preferredChainId = isDevMode ? ChainId.GORLI : ChainId.BASE_MAINNET;

export const walletService = {
  /**
   * Connect to wallet and return address and chain information
   */
  async connectWallet(): Promise<WalletConnectionResult> {
    try {
      // Check if already connected
      const address = AccountController.state?.address;
      const connectedChainId = ConnectorController.state?.chainId;
      
      if (address) {
        return {
          address,
          chainId: connectedChainId || preferredChainId,
          isSuccess: true
        };
      }

      // Wait for connection to complete
      return await new Promise((resolve) => {
        // Setup subscription to monitor connection state
        const unsubscribe = AccountController.subscribe((state) => {
          if (state.status === 'connected' && state.address) {
            unsubscribe();
            
            const chainId = ConnectorController.state?.chainId || preferredChainId;
            
            resolve({
              address: state.address,
              chainId: chainId,
              isSuccess: true
            });
          }
        });
        
        // If connection fails or times out
        setTimeout(() => {
          unsubscribe();
          resolve({
            address: '',
            chainId: 0,
            isSuccess: false,
            error: 'Connection timed out'
          });
        }, 30000); // 30 seconds timeout
      });
    } catch (error) {
      console.error('Wallet connection error:', error);
      return {
        address: '',
        chainId: 0,
        isSuccess: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  /**
   * Check if the current chain is supported
   */
  isSupportedChain(chainId: number): boolean {
    const supportedChains = isDevMode 
      ? [ChainId.GORLI, ChainId.BSC_TESTNET] 
      : [ChainId.MAINNET, ChainId.BSC_MAINNET, ChainId.POLYGON_MAINNET, ChainId.BASE_MAINNET];
    
    return supportedChains.includes(chainId);
  },

  /**
   * Switch to the preferred chain
   */
  async switchChain(targetChainId: number = preferredChainId): Promise<boolean> {
    try {
      // Request chain switch
      await ConnectorController.switchChain({ chainId: targetChainId });
      
      // Wait for chain to be updated
      return await new Promise((resolve) => {
        const unsubscribe = ConnectorController.subscribe((state) => {
          if (state.chainId === targetChainId) {
            unsubscribe();
            resolve(true);
          }
        });
        
        // Timeout after 15 seconds
        setTimeout(() => {
          unsubscribe();
          resolve(false);
        }, 15000);
      });
    } catch (error) {
      console.error('Chain switch error:', error);
      return false;
    }
  },

  /**
   * Get the current chain name
   */
  getChainName(chainId: number): string {
    const chainNames: Record<number, string> = {
      [ChainId.MAINNET]: 'Ethereum',
      [ChainId.GORLI]: 'Goerli Testnet',
      [ChainId.BSC_MAINNET]: 'BNB Chain',
      [ChainId.BSC_TESTNET]: 'BNB Testnet',
      [ChainId.POLYGON_MAINNET]: 'Polygon',
      [ChainId.BASE_MAINNET]: 'Base',
    };
    
    return chainNames[chainId] || `Chain ID ${chainId}`;
  },

  /**
   * Get the preferred chain ID based on environment
   */
  getPreferredChainId(): number {
    return preferredChainId;
  },

  /**
   * Disconnect the wallet
   */
  async disconnectWallet(): Promise<boolean> {
    try {
      await ConnectorController.disconnect();
      return true;
    } catch (error) {
      console.error('Wallet disconnect error:', error);
      return false;
    }
  }
};
