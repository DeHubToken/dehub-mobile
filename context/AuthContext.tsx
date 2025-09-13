import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
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
} from "../libs/auth.utils";
import { AuthService } from "../services/auth.service";
import { getAccount, getNotifications } from "../services/user.service";
import { ethersService } from "../services/ethers.service";
import { supportedTokens } from "../config/constants";
import { apiClient } from "../libs/api.client";
import { maxStacked } from "../libs/validators.util";

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
  tokenBalances?: { [symbol: string]: number };
  badge?: { name: string; amount: number };
  notificationCount?: number; // unread notifications (capped display)
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
type ProviderStatus = "idle" | "initializing" | "ready" | "error";
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
  patchUser: (
    update: Partial<User> | ((prev: User) => Partial<User>)
  ) => Promise<User | null>;
  provider?: any | null;
  chainId?: number;
  providerStatus: ProviderStatus;
  ensureProvider: () => Promise<void>;
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
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>("idle");
  const providerInitPromiseRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Provider initialization with timeout + retries + single-flight protection.
   */
  const ensureProvider = useCallback(async () => {
    if (provider || providerStatus === "ready") return;
    if (providerInitPromiseRef.current) return providerInitPromiseRef.current;

    const attemptInit = async (attempt: number, maxAttempts: number) => {
      const start = Date.now();
      try {
        setProviderStatus("initializing");
        const p = await withTimeout(getWeb3AuthProvider(), 12000);
        if (!p) throw new Error("Provider returned null/undefined");
        if (!isMountedRef.current) return;
        setProvider(p);
        // Resolve chainId (fallback safe parse)
        try {
          const cid = await p.request?.({ method: "eth_chainId" });
          if (cid) {
            const parsed =
              typeof cid === "string"
                ? parseInt(cid, 16) || parseInt(cid, 10) || undefined
                : Number(cid);
            if (parsed && !Number.isNaN(parsed)) setChainId(parsed);
          }
        } catch (e) {
          console.warn("[AuthContext] failed to read chainId from provider", e);
        }
        setProviderStatus("ready");
        console.log(
          `[AuthContext] provider initialized in ${Date.now() - start}ms (attempt ${attempt + 1})`
        );
      } catch (e) {
        console.warn(
          `[AuthContext] provider init attempt ${attempt + 1} failed`,
          e
        );
        if (attempt + 1 < maxAttempts) {
          const backoff = [400, 1500, 3000][attempt] || 5000;
          await sleep(backoff);
          return attemptInit(attempt + 1, maxAttempts);
        } else {
          if (!isMountedRef.current) return;
          setProviderStatus("error");
          throw e;
        }
      }
    };

    const initPromise = attemptInit(0, 3).catch(() => {});
    providerInitPromiseRef.current = initPromise;
    await initPromise;
    providerInitPromiseRef.current = null;
  }, [provider, providerStatus]);

  // Helpers
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
  const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    return new Promise((resolve, reject) => {
      const to = setTimeout(
        () => reject(new Error(`Timeout after ${ms}ms`)),
        ms
      );
      promise
        .then((val) => {
          clearTimeout(to);
          resolve(val);
        })
        .catch((err) => {
          clearTimeout(to);
          reject(err);
        });
    });
  };

  // Initialize auth state & kick provider initialization (non-blocking for boot)
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const [userData, token, seenAuth] = await Promise.all([
          getAuthUser<User>(),
          getAuthToken(),
          hasSeenAuth(),
        ]);
        if (userData && token) {
          setUser(userData);
          setIsSignedIn(true);
          // Start provider init in background; don't await to keep boot fast
          ensureProvider().catch((e) =>
            console.warn("[AuthContext] background provider init failed", e)
          );
        }
        if (seenAuth) setIsFirstTimeUser(false);
      } catch (e) {
        console.error("Failed to load auth state:", e);
      } finally {
        setIsBootLoading(false);
      }
    };
    loadAuthState();
  }, [ensureProvider]);

  // Fallback: if user is set but provider not yet loaded (e.g., provider init race)
  // Remove deferred provider hydrate: we no longer auto-init provider on boot
  // Provider only created on fresh sign-in.

  // Sign in with wallet (will always (re)initialize provider immediately after backend sign-in)
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
      // Force re-init provider fresh for this session
      setProvider(null);
      setChainId(chainId);
      try {
        await ensureProvider();
      } catch (e) {
        console.warn("[AuthContext] provider init during signIn failed", e);
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
    // Notifications (unread count) - backend returns only unread for given address
    try {
      const addr = enriched.walletAddress || enriched.address;
      if (addr) {
        const nRes: any = await getNotifications(addr, { unit: 20 });
        const notificationRes = nRes?.data?.result || nRes?.result || nRes;
        if (notificationRes) {
          const unread = (notificationRes as any[]).length;
          enriched = { ...enriched, notificationCount: unread };
        }
      }
    } catch (e) {
      console.warn("[AuthContext] notifications fetch failed", e);
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
      // Derive stakedDHB from balanceData if not already present or outdated
      if (enriched?.balanceData?.length) {
        const derivedStake = maxStacked(enriched.balanceData);
        if (typeof derivedStake === "number") {
          enriched = { ...enriched, stakedDHB: derivedStake };
        }
      }
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
      setProviderStatus("idle");
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

  const patchUser: AuthContextType["patchUser"] = async (update) => {
    try {
      if (!user) return null; // silently ignore if no user
      const partial = typeof update === "function" ? update(user) : update;
      if (!partial || typeof partial !== "object") return user;
      const merged: User = { ...user, ...partial };
      setUser(merged); // optimistic in-memory update
      try {
        await setAuthUser(merged); // persist
      } catch (e) {
        console.warn("[AuthContext] patchUser persist failed", e);
      }
      return merged;
    } catch (e) {
      console.warn("[AuthContext] patchUser error", e);
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
    providerStatus,
    ensureProvider,
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
