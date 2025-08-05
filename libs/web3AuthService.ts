// import { Web3Auth } from '@web3auth/react-native-sdk';
// import { ethers } from 'ethers';
// import '@ethersproject/shims';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { setAuthUser, setAuthToken, clearAuthData } from './authUtils';
// import { web3AuthConfig, WALLET_CONNECT_PROJECT_ID, AUTH_METHODS } from './web3AuthConfig';
// import { User } from '../context/AuthContext';

// // Initialize Web3Auth
// let web3auth: Web3Auth | null = null;

// // Function to initialize Web3Auth
// export const initializeWeb3Auth = async (): Promise<Web3Auth> => {
//   if (!web3auth) {
//     web3auth = new Web3Auth(web3AuthConfig);
//     await web3auth.init();
//   }
//   return web3auth;
// };

// // Store the wallet type (web3auth or walletconnect)
// export const setWalletType = async (type: string): Promise<void> => {
//   await AsyncStorage.setItem('wallet_type', type);
// };

// // Get the wallet type
// export const getWalletType = async (): Promise<string | null> => {
//   return AsyncStorage.getItem('wallet_type');
// };

// // Convert wallet address to a User object
// const walletToUser = (address: string, provider?: string): User => {
//   return {
//     id: address,
//     email: `${address.substring(0, 8)}@wallet.user`,
//     username: `${provider || 'wallet'}_${address.substring(0, 8)}`,
//     walletAddress: address,
//     authProvider: provider || 'wallet',
//   };
// };

// export const Web3AuthService = {
//   // Login with Web3Auth (social logins)
//   async loginWithWeb3Auth(provider: string): Promise<{user: User, token: string}> {
//     try {
//       const web3auth = await initializeWeb3Auth();
//       const info = await web3auth.login({
//         loginProvider: provider,
//       });

//       if (info?.privKey) {
//         // Create wallet from private key
//         const wallet = new ethers.Wallet(info.privKey);
//         const address = wallet.address;
        
//         // Generate a simple token (in production, should be JWT from server)
//         const timestamp = Date.now();
//         const message = `Authenticating ${address} at ${timestamp}`;
//         const signature = await wallet.signMessage(message);
//         const token = signature;
        
//         // Create user from wallet
//         const user = walletToUser(address, provider);
        
//         // Save auth data
//         await setAuthUser(user);
//         await setAuthToken(token);
//         await setWalletType(AUTH_METHODS.WEB3AUTH_SOCIAL);
        
//         return { user, token };
//       }
//       throw new Error('Failed to get private key from Web3Auth');
//     } catch (error) {
//       console.error('Web3Auth login error:', error);
//       throw error;
//     }
//   },
  
//   // Connect with WalletConnect
//   async connectWithWalletConnect(): Promise<{user: User, token: string}> {
//     try {
//       // In a real implementation, you would use the WalletConnect SDK
//       // to connect to the user's wallet. This is a placeholder.
//       const mockAddress = '0x' + Array(40).fill(0).map(() => 
//         Math.floor(Math.random() * 16).toString(16)).join('');
      
//       // Create a simple token
//       const timestamp = Date.now();
//       const token = `wc_${mockAddress}_${timestamp}`;
      
//       // Create user from wallet
//       const user = walletToUser(mockAddress, 'walletconnect');
      
//       // Save auth data
//       await setAuthUser(user);
//       await setAuthToken(token);
//       await setWalletType(AUTH_METHODS.WALLET_CONNECT);
      
//       return { user, token };
//     } catch (error) {
//       console.error('WalletConnect error:', error);
//       throw error;
//     }
//   },
  
//   // Logout from Web3Auth
//   async logout(): Promise<void> {
//     try {
//       const walletType = await getWalletType();
      
//       if (walletType === AUTH_METHODS.WEB3AUTH_SOCIAL) {
//         const web3auth = await initializeWeb3Auth();
//         await web3auth.logout();
//       }
      
//       // Clear stored auth data
//       await clearAuthData();
//       await AsyncStorage.removeItem('wallet_type');
//     } catch (error) {
//       console.error('Logout error:', error);
//       // Clear auth data even if logout fails
//       await clearAuthData();
//       await AsyncStorage.removeItem('wallet_type');
//       throw error;
//     }
//   }
// };
