import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
} from "react";
import { getWeb3AuthProvider } from "../services/web3auth.service";
// Adapter abstraction (currently only web3auth implementation)
import { createAuthAdapter, AuthAdapter } from "../services/auth/authAdapter";
import {
  ActivityIndicator,
  View,
  Alert,
  AppState,
  AppStateStatus,
} from "react-native";
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
import { EthersService, ethersService } from "../services/ethers.service";
import { supportedTokens } from "../config/constants";
import { apiClient } from "../libs/api.client";
import { maxStacked } from "../libs/validators.util";
import { toastError } from "../libs";

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
  ensureFreshProvider: () => Promise<void>; // validates & reinitializes if stale
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
  const providerInitInFlightRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);
  const providerValidationInFlightRef = useRef<Promise<void> | null>(null);
  const lastValidationTsRef = useRef<number>(0);
  const lastReinitTsRef = useRef<number>(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const providerGenerationRef = useRef<number>(0); // increments on each successful init
  const authAdapterRef = useRef<AuthAdapter | null>(null);
  const healthIntervalRef = useRef<any>(null);
  const REINIT_BACKOFF_MS = 3000; // minimal gap between forced re-inits
  const VALIDATION_THROTTLE_MS = 15000; // cap validation frequency
  const HEALTHCHECK_INTERVAL_MS = 120000; // 2 min health check
  const consecutiveEmptyAccountsRef = useRef<number>(0);

  // Optional debug flag (toggle to true for verbose logs)
  const DEBUG_PROVIDER = false;
  const debugLog = useCallback(
    (...args: any[]) => {
      if (DEBUG_PROVIDER) console.log("[AuthContext][provider]", ...args);
    },
    [DEBUG_PROVIDER]
  );

  // console.log({user, provider})
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Provider initialization (simplified, doc-aligned) with single-flight.
   * - Grabs Web3Auth EIP-1193 provider
   * - Reads chainId and accounts via RPC
   * - Adds chainChanged listener
   * Note: EIP-1193 providers do not expose a .signer property — this is normal.
   */
  const fetchAccounts = useCallback(
    async (prov: any): Promise<string[] | null> => {
      if (!prov?.request) return null;
      try {
        const accounts: any = await prov.request({ method: "eth_accounts" });
        if (Array.isArray(accounts)) return accounts as string[];
        return [];
      } catch (e) {
        debugLog("eth_accounts failed", e);
        return null;
      }
    },
    [debugLog]
  );

  const attachProviderEventListeners = useCallback((prov: any) => {
    try {
      prov?.on?.("chainChanged", (next: any) => {
        const parsed =
          typeof next === "string" && next.startsWith("0x")
            ? parseInt(next, 16)
            : Number(next);
        debugLog("chainChanged", { next, parsed });
        if (!Number.isNaN(parsed)) setChainId(parsed);
      });
    } catch (e) {
      console.warn("[AuthContext] chainChanged listener attach failed", e);
    }
    try {
      prov?.on?.("accountsChanged", (accs: string[]) => {
        debugLog("accountsChanged", accs);
        if (!accs || accs.length === 0) {
          // schedule validation quickly
          validateAndMaybeReinit("accountsChanged-empty");
        }
      });
    } catch (e) {
      console.warn("[AuthContext] accountsChanged listener attach failed", e);
    }
    try {
      prov?.on?.("disconnect", (err: any) => {
        console.warn("[AuthContext] provider disconnect", err?.message || err);
        validateAndMaybeReinit("disconnect");
      });
    } catch (e) {
      /* ignore */
    }
  }, []);

  const internalInitializeProvider = useCallback(async () => {
    setProviderStatus("initializing");
    const startTs = Date.now();
    try {
      if (!authAdapterRef.current) authAdapterRef.current = createAuthAdapter();
      const eip1193 = await authAdapterRef.current.getProvider();
      if (!eip1193)
        throw new Error("getWeb3AuthProvider returned null/undefined");
      if (!isMountedRef.current) return;
      setProvider(eip1193);
      providerGenerationRef.current += 1;

      // Chain id attempt (try request first, fallback to chainConfig)
      try {
        let rawChainId: any;
        if (typeof eip1193.request === "function") {
          rawChainId = await eip1193.request({ method: "eth_chainId" });
        }
        if (!rawChainId) rawChainId = eip1193?.chainConfig?.chainId;
        const parsed =
          typeof rawChainId === "string" && rawChainId.startsWith("0x")
            ? parseInt(rawChainId, 16)
            : Number(rawChainId);
        if (!Number.isNaN(parsed)) setChainId(parsed);
      } catch (e) {
        console.warn("[AuthContext] chainId fetch failed", e);
      }

      attachProviderEventListeners(eip1193);

      // Initial account validation (non-blocking reinit if missing)
      const accounts = await fetchAccounts(eip1193);
      if (!accounts || accounts.length === 0) {
        debugLog("initial accounts empty; scheduling validation");
        setTimeout(
          () => validateAndMaybeReinit("initial-accounts-empty"),
          1500
        );
      }

      setProviderStatus("ready");
      debugLog("provider initialized", {
        ms: Date.now() - startTs,
        gen: providerGenerationRef.current,
      });
    } catch (e) {
      console.error("[AuthContext] internalInitializeProvider failed", e);
      setProviderStatus("error");
      throw e;
    }
  }, [attachProviderEventListeners, fetchAccounts, debugLog]);

  const attemptReinitializeProvider = useCallback(
    async (reason: string) => {
      const now = Date.now();
      if (now - lastReinitTsRef.current < REINIT_BACKOFF_MS) {
        debugLog("reinit suppressed (backoff)", { reason });
        return;
      }
      lastReinitTsRef.current = now;
      debugLog("attemptReinitializeProvider", { reason });
      setProvider(null);
      setProviderStatus("idle");
      try {
        await internalInitializeProvider();
      } catch (e) {
        console.warn("[AuthContext] reinit failed", e);
      }
    },
    [internalInitializeProvider, debugLog]
  );

  // Sign out method (moved earlier so other callbacks can depend on it safely)
  const signOut = useCallback(async () => {
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
  }, []);

  const handleSessionExpired = useCallback(
    async (trigger: string) => {
      console.warn("[AuthContext] Session expired detected", trigger);
      toastError?.("Session expired, login again");
      try {
        await signOut();
      } catch (e) {
        console.warn("[AuthContext] signOut during session expire failed", e);
      }
      // Open sign-in bottom sheet/modal
      setShowSignInModal(true);
      consecutiveEmptyAccountsRef.current = 0; // reset counter
    },
    [signOut]
  );

  const validateAndMaybeReinit = useCallback(
    async (reason: string) => {
      if (providerValidationInFlightRef.current)
        return providerValidationInFlightRef.current;
      const run = (async () => {
        const now = Date.now();
        if (now - lastValidationTsRef.current < VALIDATION_THROTTLE_MS) return;
        lastValidationTsRef.current = now;
        if (!provider || providerStatus !== "ready") return;
        const accounts = await fetchAccounts(provider);
        if (!accounts || accounts.length === 0) {
          debugLog("validation detected empty accounts", { reason });
          consecutiveEmptyAccountsRef.current += 1;
          await attemptReinitializeProvider(reason + "->empty-accounts");
          // Re-check after short delay to confirm
          setTimeout(async () => {
            if (!provider || providerStatus !== "ready") return; // already changed state
            const postAccounts = await fetchAccounts(provider);
            if (!postAccounts || postAccounts.length === 0) {
              consecutiveEmptyAccountsRef.current += 1;
            } else {
              consecutiveEmptyAccountsRef.current = 0;
            }
            if (consecutiveEmptyAccountsRef.current >= 2 && user) {
              await handleSessionExpired(reason);
            }
          }, 1200);
        } else {
          // reset counter on healthy accounts
          if (consecutiveEmptyAccountsRef.current !== 0) {
            consecutiveEmptyAccountsRef.current = 0;
          }
        }
      })();
      providerValidationInFlightRef.current = run;
      await run.finally(() => {
        providerValidationInFlightRef.current = null;
      });
    },
    [
      provider,
      providerStatus,
      fetchAccounts,
      attemptReinitializeProvider,
      debugLog,
    ]
  );

  const ensureProvider = useCallback(async () => {
    if (provider || providerStatus === "ready") return;
    if (providerInitInFlightRef.current) return providerInitInFlightRef.current;
    const init = internalInitializeProvider();
    providerInitInFlightRef.current = init;
    await init.finally(() => {
      providerInitInFlightRef.current = null;
    });
  }, [provider, providerStatus, internalInitializeProvider]);

  const ensureFreshProvider = useCallback(async () => {
    if (!provider || providerStatus !== "ready") {
      await ensureProvider();
      return;
    }
    await validateAndMaybeReinit("explicit-ensure-fresh");
  }, [provider, providerStatus, ensureProvider, validateAndMaybeReinit]);

  // Auto ensure freshness shortly after provider becomes ready while signed in
  useEffect(() => {
    if (isSignedIn && providerStatus === "ready" && provider) {
      // slight delay to allow any lazy internals to hydrate
      const t = setTimeout(() => {
        ensureFreshProvider().catch(() => {});
      }, 800);
      return () => clearTimeout(t);
    }
  }, [isSignedIn, providerStatus, provider, ensureFreshProvider]);

  // Helpers
  // Removed retry/timeout helpers to simplify provider setup per docs.

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
          // Initialize provider in background (non-blocking)
          ensureProvider().catch((e) =>
            console.warn("[AuthContext] provider init during boot failed", e)
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

  // AppState resume validation
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        validateAndMaybeReinit("app-resume");
      }
    });
    return () => sub.remove();
  }, [validateAndMaybeReinit]);

  // Periodic health check
  useEffect(() => {
    if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);
    healthIntervalRef.current = setInterval(() => {
      if (AppState.currentState === "active")
        validateAndMaybeReinit("health-interval");
    }, HEALTHCHECK_INTERVAL_MS);
    return () => {
      if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);
    };
  }, [validateAndMaybeReinit]);

  // Sign in with wallet (will always (re)initialize provider immediately after backend sign-in)
  const signInWithWallet = async (walletAddress: string, chainId: number) => {
    setIsLoading(true);
    try {
      // console.log("[AuthContext] signInWithWallet called", {
      //   walletAddress,
      //   chainId,
      // });
      // Try to retrieve private key from Web3Auth provider when signing in
      let privateKey: string | undefined;
      try {
        if (!authAdapterRef.current) authAdapterRef.current = createAuthAdapter();
        privateKey = await authAdapterRef.current.getPrivateKey?.();
      } catch (e) {
        console.warn("[AuthContext] adapter.getPrivateKey failed", e);
      }
      const {
        user: walletUser,
        token,
        needsUsername: need,
      } = await AuthService.signInWithWallet(walletAddress, chainId, {
        privateKey,
      });
      // Initialize provider now that we have a session
      setProvider(null);
      setChainId(chainId);
      try {
        await ensureProvider();
      } catch (e) {
        console.warn("[AuthContext] provider init during signIn failed", e);
      }
      await setHasSeenAuth();
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

  // console.log("[AuthContext]", { provider });
  if (provider && !("signer" in (provider as any))) {
    // EIP-1193 providers do not expose a signer property; ethers derives it via Web3Provider
    console.log(
      "[AuthContext] Provider is EIP-1193; .signer not present (expected). Ethers will create a Signer via Web3Provider."
    );
  }

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
    ensureFreshProvider,
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
