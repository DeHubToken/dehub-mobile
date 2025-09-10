import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from "react";
import { getWeb3AuthProvider } from "../services/web3auth.service";
import { ActivityIndicator, View, Alert } from "react-native";
import SignInGatewayModal from "../components/auth/SignInGatewayModal";
import { theme } from "../theme";
import {
  hasSeenAuth,
  setHasSeenAuth,
  getAuthUser,
  getAuthToken,
  setAuthUser,
  setAuthToken,
  clearAuthData,
} from "../libs/authUtils";
import { AuthService } from "../services/auth.service";
import { getAccount } from "../services/user.service";
import { ethersService } from "../services/ethers.service";
import { supportedTokens } from "../config/constants";
import { apiClient } from "../libs/apiClient";

// Define the shape of the user object
export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  walletAddress?: string;
  authProvider?: string;
  // Extended account info fields (from account_info response)
  balance?: number;
  balanceData?: {
    tokenAddress: string;
    chainId: number;
    walletBalance: number;
    staked: number;
  }[];
  depositedBalance?: number;
  displayName?: string;
  avatarImageUrl?: string;
  isLiked?: boolean;
  coverImageUrl?: string;
  aboutMe?: string;
  facebookLink?: string;
  twitterLink?: string;
  discordLink?: string;
  instagramLink?: string;
  tiktokLink?: string;
  youtubeLink?: string;
  telegramLink?: string;
  balances?: number[];
  walletBalances?: number[] | null;
  tokenBalances?: { [symbol: string]: number };
  badge?: { name: string; amount: number };
  receivedTips?: number;
  sentTips?: number;
  address?: string; // sometimes returned as address
  stakedDHB?: number;
  uploads?: number;
  followers?: string[];
  followings?: string[];
  likes?: string[];
  unlocked?: string[];
  createdAt?: string;
  info?: { walletBalances?: { [key: string]: number } };
}

// Define the shape of the auth context
interface AuthContextType {
  user: User | null;
  // Ongoing operation loading (sign-in, sign-out, profile actions)
  isLoading: boolean;
  // Initial boot/loading of persisted auth state
  isBootLoading: boolean;
  isSignedIn: boolean;
  isFirstTimeUser: boolean;
  signOut: () => Promise<void>;
  skipAuth: () => Promise<void>;
  updateUserProfile: (userData: Partial<User>) => Promise<void>;
  signInWithWallet: (walletAddress: string, chainId: number) => Promise<void>;
  needsUsername: boolean;
  provisionalUser: any | null;
  provisionalToken: string | null; // deprecated (token stored early)
  completeUsername: (finalUser: User) => void;
  refreshUser: () => Promise<void>;
  requireAuth: (action: () => void) => void;
  // Apply a partial user update (merge + persist). Accepts object or function.
  patchUser: (update: Partial<User> | ((prev: User) => Partial<User>)) => Promise<User | null>;
  provider?: any | null;
  chainId?: number;
  // Add more auth methods as needed
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider props
interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  // Runtime operation loading (sign in/out). Starts false so UI (SignInScreen) remains mounted.
  const [isLoading, setIsLoading] = useState(false);
  // Boot loading (initial secure storage hydration)
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [provisionalUser, setProvisionalUser] = useState<any | null>(null);
  const [provisionalToken, setProvisionalToken] = useState<string | null>(null); // kept for backward compatibility
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [provider, setProvider] = useState<any | null>(null);
  const [chainId, setChainId] = useState<number | undefined>(undefined);

  // Initialize auth state
  useEffect(() => {
    // Load auth state from SecureStore
    const loadAuthState = async () => {
      try {
        const userData = await getAuthUser<User>();
        const token = await getAuthToken();
        const seenAuth = await hasSeenAuth();

        // console.log("Auth state loaded:", { userData, token });
        if (userData && token) {
          setUser(userData);
          setIsSignedIn(true);
          // Attempt to hydrate provider & chainId immediately
          try {
            const p = await getWeb3AuthProvider();
            setProvider(p);
            try {
              const chainHex = await p.request?.({ method: 'eth_chainId' });
              if (chainHex) setChainId(parseInt(chainHex, 16));
            } catch {}
          } catch (e) {
            console.warn('[AuthContext] provider hydrate on boot failed', e);
          }
        }

        if (seenAuth) setIsFirstTimeUser(false);
      } catch (error) {
        console.error("Failed to load auth state:", error);
      } finally {
        setIsBootLoading(false);
      }
    };

    loadAuthState();
  }, []);

  // Fallback: if user is set but provider not yet loaded (e.g., provider init race)
  useEffect(() => {
    if (user && isSignedIn && !provider) {
      (async () => {
        try {
          const p = await getWeb3AuthProvider();
          setProvider(p);
          try {
            const chainHex = await p.request?.({ method: 'eth_chainId' });
            if (chainHex) setChainId(parseInt(chainHex, 16));
          } catch {}
        } catch (e) {
          console.warn('[AuthContext] deferred provider hydrate failed', e);
        }
      })();
    }
  }, [user, isSignedIn, provider]);

  // Sign in with wallet
  const signInWithWallet = async (walletAddress: string, chainId: number) => {
    setIsLoading(true);
    try {
      console.log("[AuthContext] signInWithWallet called", {
        walletAddress,
        chainId,
      });
      const {
        user: walletUser,
        token,
        needsUsername: need,
      } = await AuthService.signInWithWallet(walletAddress, chainId);
      // Load / attach provider after successful low-level sign-in (before enrichment)
      try {
        const p = await getWeb3AuthProvider();
        setProvider(p);
        setChainId(chainId); // supplied by caller
      } catch (e) {
        console.warn('[AuthContext] provider init failed', e);
      }
      await setHasSeenAuth();
      console.log("[AuthContext] signInWithWallet result", {
        need,
        walletUserUsername: walletUser?.username,
      });
      if (need) {
        setNeedsUsername(true);
        setProvisionalUser(walletUser);
        setProvisionalToken(token); // retaned but not required later
      } else {
        // Mark signed in early for downstream UI (will be immediately enriched)
        setIsSignedIn(true);
        setIsFirstTimeUser(false);
        setNeedsUsername(false);
        setProvisionalUser(null);
        setProvisionalToken(null);
        await enrichAndStoreUser(walletUser);
      }
    } catch (error) {
      console.error("Wallet sign in error:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const completeUsername = (finalUser: User) => {
    console.log("[AuthContext] completeUsername", {
      finalUserUsername: finalUser?.username,
    });
    setIsSignedIn(true);
    setIsFirstTimeUser(false);
    setNeedsUsername(false);
    setProvisionalUser(null);
    setProvisionalToken(null);
    // Enrich asynchronously (fire and forget)
    enrichAndStoreUser(finalUser).catch((e) => {
      console.warn("[AuthContext] enrich after completeUsername failed", e);
      setUser(finalUser); // fallback minimal
      setAuthUser(finalUser).catch(() => {});
    });
  };

  // Central enrichment logic (account info + balances) ---------------------------------
  const enrichAndStoreUser = useCallback(async (base: User): Promise<User> => {
    let enriched = base;
    try {
      const key = base.username || base.walletAddress || base.address;
      if (key) {
        const res: any = await getAccount(key);
        if (res?.result) {
          enriched = { ...base, ...res.result };
        }
      }
    } catch (e) {
      console.warn("[AuthContext] account fetch failed", e);
    }
    // Fetch balances (native + selected tokens)
    try {
      const acctAddr = enriched.walletAddress || enriched.address;
      if (acctAddr) {
        const BASE_CHAIN_ID = 8453; // Base mainnet
        const symbols = ["DHB", "USDC", "USDT", "WETH"];
        const balances = await ethersService.getTokenBalances(
          acctAddr,
          BASE_CHAIN_ID,
          symbols
        );
        enriched = { ...enriched, tokenBalances: balances } as any;
      }
    } catch (e) {
      console.warn("[AuthContext] balance fetch failed", e);
    }
    try {
      setUser(enriched);
      await setAuthUser(enriched);
    } catch (e) {
      console.warn("[AuthContext] setAuthUser failed", e);
    }
    return enriched;
  }, []);

  // If user just became signed in and there is a pending protected action, run it
  useEffect(() => {
    if (isSignedIn && pendingAction && !needsUsername) {
      try {
        pendingAction();
      } catch (e) {
        console.warn("[AuthContext] pendingAction failed", e);
      }
      setPendingAction(null);
      setShowSignInModal(false);
    }
  }, [isSignedIn, pendingAction, needsUsername]);

  const requireAuth = (action: () => void) => {
    if (isSignedIn && !needsUsername) {
      action();
    } else {
      setPendingAction(() => action);
      setShowSignInModal(true);
    }
  };

  // Sign out method
  const signOut = async () => {
    setIsLoading(true);
    try {
      await clearAuthData();
      setUser(null);
      setIsSignedIn(false);
      setProvider(null);
      setChainId(undefined);
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Skip auth method - allows users to use the app without signing in
  const skipAuth = async () => {
    try {
      await setHasSeenAuth();
      setIsFirstTimeUser(false);
    } catch (error) {
      console.error("Skip auth error:", error);
      throw error;
    }
  };

  // Update user profile
  const updateUserProfile = async (userData: Partial<User>) => {
    try {
      if (!user) throw new Error("User not authenticated");
      // In a real app, you would call an API to update the profile
      const updatedUser = { ...user, ...userData };
      await setAuthUser(updatedUser);
      setUser(updatedUser);
      return updatedUser;
    } catch (error) {
      console.error("Update profile error:", error);
      throw error;
    }
  };

  const patchUser: AuthContextType['patchUser'] = async (update) => {
    try {
      if (!user) return null; // silently ignore if no user
      const partial = typeof update === 'function' ? update(user) : update;
      if (!partial || typeof partial !== 'object') return user;
      const merged: User = { ...user, ...partial };
      setUser(merged); // optimistic in-memory update
      try {
        await setAuthUser(merged); // persist
      } catch (e) {
        console.warn('[AuthContext] patchUser persist failed', e);
      }
      return merged;
    } catch (e) {
      console.warn('[AuthContext] patchUser error', e);
      return user;
    }
  };

  // Create the context value object
  const authContextValue: AuthContextType = {
    user,
    isLoading,
    isBootLoading,
    isSignedIn,
    isFirstTimeUser,
    signOut,
    skipAuth,
    signInWithWallet,
    needsUsername,
    provisionalUser,
    provisionalToken,
    completeUsername,
    refreshUser: async () => {
      try {
        if (!user) return;
        await enrichAndStoreUser(user);
      } catch (e) {
        console.warn("[AuthContext] refreshUser error", e);
      }
    },
    updateUserProfile: async (userData: Partial<User>) => {
      const updated = await updateUserProfile(userData);
      return;
    },
    requireAuth,
    patchUser,
    provider,
    chainId,
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
      {showSignInModal && !isSignedIn && !needsUsername && (
        <SignInGatewayModal
          visible={showSignInModal}
          onClose={() => {
            setShowSignInModal(false);
            setPendingAction(null);
          }}
        />
      )}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
