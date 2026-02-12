import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
  useMemo,
  memo,
} from "react";
// Adapter abstraction (currently only web3auth implementation)
import { AuthAdapter } from "../services/auth/authAdapter";
import { AppStateStatus } from "react-native";
import SignInGatewayModal from "../components/auth/SignInGatewayModal";
import { UsernameRequiredModal } from "../components/auth/UsernameRequiredModal";
import {
  hasSeenAuth,
  setHasSeenAuth,
  getAuthUser,
  getAuthToken,
  setAuthUser,
  clearAuthData,
  getAuthMethod,
} from "../libs/auth.utils";
import { createLogger } from "../libs/logger";
import { getSigningProvider } from "../libs/provider.registry";
import { useProviderLifecycle, type EIP1193Provider, type ProviderStatus } from "../hooks/useProviderLifecycle";
import { useBalances } from "../hooks/useBalances";
import { useAuthBoot } from "../hooks/useAuthBoot";
import { useAuthSession } from "../hooks/useAuthSession";
import FullScreenLoader from "../components/FullScreenLoader";
import { toastSuccess, toastError } from "../libs";
import {
  getPreferredChainId,
  setPreferredChainId,
  removeAuthToken,
  clearAuthSignature,
} from "../libs/auth.utils";
import { resetWeb3AuthInstance } from "../config/web3auth.config";
  // --- Chain switching (centralized) --------------------------------------
  import { SUPPORTED_NETWORKS, supportedNetworks } from "../config/web3.constants";
  import { setLocalAuthChainId } from "../services/auth/localProviderAdapter";
// DM data bootstrap is handled in DM hooks to keep AuthContext modular

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
  pendingFollowRequests?: number; // count of pending follow requests
  receivedTips?: number;
  sentTips?: number;
  address?: string; // sometimes returned as address
  badgeBalance?: number; // backend-computed badge balance
  stakedDHB?: number;
  uploads?: number;
  followers?: number; // count of followers
  followings?: number; // count of following
  hideFollowers?: boolean; // privacy setting to hide follow lists
  isPrivate?: boolean; // privacy setting to make account private
  likes?: string[];
  unlocked?: string[];
  createdAt?: string;
  info?: { walletBalances?: { [key: string]: number } };
  dmSettings?: {
    address: string;
    disables: ("NEW_DM" | "ALL" | "ACTIVE_ALL")[];
    minTipDhb: number;
  };
  // Blocklist info (from getAccountInfo)
  blocklist?: {
    blocked: Array<{
      address?: string;
      username?: string;
      reportId?: string; // needed for precise unblocking on server
    }>;
    blockedBy: Array<{
      address?: string;
      username?: string;
      reportId?: string; // may be provided by backend for reference
    }>;
    adminBlocked: boolean;
  };
}

// Define the shape of the auth context
interface AuthContextType {
  user: User | null;
  // Ongoing operation loading (sign-in, sign-out, profile actions)
  isLoading: boolean;
  // Initial boot/loading of persisted auth state
  isBootLoading: boolean;
  // Background token balances loading
  balancesLoading: boolean;
  isSignedIn: boolean;
  isFirstTimeUser: boolean;
  signOut: () => Promise<void>;
  skipAuth: () => Promise<void>;
  signInWithWallet: (walletAddress: string, chainId: number, overridePrivateKey?: string) => Promise<void>;
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
  provider?: EIP1193Provider | null;
  chainId?: number;
  providerStatus: ProviderStatus;
  ensureProvider: () => Promise<void>;
  ensureFreshProvider: () => Promise<void>; // validates & reinitializes if stale
  authMethod?: 'local' | 'web3auth' | null;
  // Switch active chain and block UI until done
  switchChain: (targetChainId: number) => Promise<void>;
  isSwitchingChain?: boolean;
  // Add more auth methods as needed
}

// === SPLIT CONTEXTS FOR PERFORMANCE ===
// These separate contexts prevent re-render cascades across the app
// Components only subscribe to the specific data they need

// User data context (updates rarely - only on profile changes)
interface UserContextType {
  user: User | null;
}

// Auth state context (updates on sign in/out)
interface AuthStateContextType {
  isLoading: boolean;
  isBootLoading: boolean;
  isSignedIn: boolean;
  isFirstTimeUser: boolean;
  needsUsername: boolean;
  provisionalUser: any | null;
  provisionalToken: string | null;
  balancesLoading: boolean;
}

// Provider context (updates on wallet/chain changes)
interface ProviderContextType {
  provider?: EIP1193Provider | null;
  chainId?: number;
  providerStatus: ProviderStatus;
  authMethod?: 'local' | 'web3auth' | null;
  isSwitchingChain?: boolean;
}

// Auth actions context (never updates - stable function references)
interface AuthActionsContextType {
  signOut: () => Promise<void>;
  skipAuth: () => Promise<void>;
  signInWithWallet: (walletAddress: string, chainId: number, overridePrivateKey?: string) => Promise<void>;
  completeUsername: (finalUser: User) => void;
  refreshUser: () => Promise<void>;
  requireAuth: (action: () => void) => void;
  patchUser: (update: Partial<User> | ((prev: User) => Partial<User>)) => Promise<User | null>;
  ensureProvider: () => Promise<void>;
  ensureFreshProvider: () => Promise<void>;
  switchChain: (targetChainId: number) => Promise<void>;
}

// Create split contexts
const UserContext = createContext<UserContextType | undefined>(undefined);
const AuthStateContext = createContext<AuthStateContextType | undefined>(undefined);
const ProviderContext = createContext<ProviderContextType | undefined>(undefined);
const AuthActionsContext = createContext<AuthActionsContextType | undefined>(undefined);

// Legacy combined context (for backward compatibility)
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider props
interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const log = useMemo(() => createLogger("AuthContext"), []);
  const [user, setUser] = useState<User | null>(null);
  // Runtime operation loading (sign in/out). Starts false so UI (SignInScreen) remains mounted.
  const [isLoading, setIsLoading] = useState(false);
  // Boot loading (initial secure storage hydration)
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [provisionalUser, setProvisionalUser] = useState<any | null>(null);
  const [provisionalToken, setProvisionalToken] = useState<string | null>(null); // kept for backward compatibility
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [authMethod, setAuthMethodState] = useState<'local' | 'web3auth' | null>(null);
  const isMountedRef = useRef(true);
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);
  const preferredChainRef = useRef<number | null>(null);
  const appliedPreferredRef = useRef(false);
  const authAdapterRef = useRef<AuthAdapter | null>(null);
  // Keep user in ref for async flows
  const userRef = useRef<User | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);
  // Bridge session-expired from session hook into provider lifecycle
  const sessionExpiredHandlerRef = useRef<(trigger: string) => Promise<void>>(async () => {});

  // Logging handled via createLogger; set DEBUG env var to enable debug-level logs.

  // console.log({user, provider})
  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

  // Provider lifecycle (init, listeners, health, validation, re-init)
  const {
    provider,
    chainId,
    providerStatus,
    ensureProvider,
    ensureFreshProvider,
    adoptProvider,
    validateAndMaybeReinit,
    resetProviderState,
    forceReinitProvider,
  } = useProviderLifecycle({
    log,
    getActiveAddress: () => userRef.current?.walletAddress || userRef.current?.address,
    onSessionExpired: async (trigger) => sessionExpiredHandlerRef.current(trigger),
  });

  // Balances (lazy-load ethers) and safe user updates
  const { fetchAndStoreBalances } = useBalances({
    log,
    setBalancesLoading,
    setUser,
    isMountedRef,
    setAuthUser: (u: User) => setAuthUser(u),
    getChainId: () => chainId,
  });

  // Boot hydration
  useAuthBoot<User>({
    getAuthUser,
    getAuthToken,
    hasSeenAuth,
    setUser,
    setIsSignedIn,
    setIsFirstTimeUser,
    setIsBootLoading,
    ensureProvider,
    log,
  });

  // Load persisted auth method once and when user changes
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getAuthMethod();
        if (!mounted) return;
        setAuthMethodState(res?.method ?? null);
      } catch {
        if (mounted) setAuthMethodState(null);
      }
    })();
    return () => { mounted = false; };
  }, [user?.address, user?.walletAddress, user?.username]);

  // Load preferred chain id on mount
  useEffect(() => {
    let m = true;
    (async () => {
      try {
        const pref = await getPreferredChainId();
        if (!m) return;
        preferredChainRef.current = pref ?? null;
      } catch {}
    })();
    return () => { m = false; };
  }, []);


  // --- Helpers: chainId parsing and provider adoption ------------------------
  // Auto ensure freshness shortly after provider becomes ready while signed in
  useEffect(() => {
    if (isSignedIn && providerStatus === "ready" && provider) {
      const t = setTimeout(() => { ensureFreshProvider().catch(() => {}); }, 800);
      return () => clearTimeout(t);
    }
  }, [isSignedIn, providerStatus, provider, ensureFreshProvider]);

  // One consolidated effect is declared later, after useAuthSession exposes enrichAndStoreUser
  const didBootRefetchRef = useRef(false);

  // Helpers
  // Removed retry/timeout helpers to simplify provider setup per docs.

  // Session management and actions
  const {
    signInWithWallet,
    completeUsername,
    requireAuth: requireAuthRaw,
    skipAuth,
    patchUser: patchUserRaw,
    refreshUser,
    enrichAndStoreUser,
    handleSessionExpired,
    signOut,
  } = useAuthSession({
    log,
    setIsLoading,
    setIsSignedIn,
    setIsFirstTimeUser,
    setNeedsUsername,
    setProvisionalUser,
    setProvisionalToken,
    setUser,
    setAuthUser: (u: User) => setAuthUser(u),
    setBalancesLoading,
    setChainId: (id) => {}, // chainId is controlled by provider lifecycle; keep no-op here
    setShowSignInModal,
    getSigningProvider,
    ensureProvider,
    adoptProvider,
    fetchAndStoreBalances,
    clearAuthData,
    providerReset: resetProviderState,
    isMountedRef,
    setAuthMethodState,
  });
  // Update session-expired handler ref
  useEffect(() => { sessionExpiredHandlerRef.current = handleSessionExpired; }, [handleSessionExpired]);

  // In-place chain switch: tear down the Web3Auth singleton, persist the new
  // preference, re-create the instance on the target chain, and re-authenticate
  // — all without restarting the app.
  const switchChain = useCallback(async (targetChainId: number) => {
    if (!targetChainId) return;
    if (chainId === targetChainId && providerStatus === 'ready') return;
    setIsSwitchingChain(true);
    try {
      const address = userRef.current?.walletAddress || userRef.current?.address;
      log.info('switchChain:start', { targetChainId, currentChainId: chainId, address: address ? `${address.slice(0,6)}...${address.slice(-4)}` : undefined });

      // 1. Persist preference (cold boots will also use this chain)
      await setPreferredChainId(targetChainId);
      try { setLocalAuthChainId(targetChainId); } catch {}

      // 2. Clear stale auth artefacts for the old chain
      await removeAuthToken();
      await clearAuthSignature();

      // 3. Tear down the current Web3Auth instance & provider state
      resetWeb3AuthInstance();

      // 4. Re-create the Web3Auth instance on the new chain & re-init provider
      //    forceReinitProvider bypasses the stale-closure guard in ensureProvider,
      //    clears the cached authAdapter, and calls internalInitializeProvider directly.
      await forceReinitProvider();

      // 5. Re-authenticate with the backend on the new chain
      if (address) {
        await signInWithWallet(address, targetChainId);
        log.info('switchChain:reauth:success', { targetChainId });
      }

      try {
        const name = (SUPPORTED_NETWORKS as any)?.[targetChainId]?.chainName || `Chain ${targetChainId}`;
        toastSuccess(`Switched to ${name}`);
      } catch {}
    } catch (e) {
      log.error('switchChain:failed', e as any);
      try { toastError(e, 'Failed to switch network'); } catch {}
      throw e;
    } finally {
      setIsSwitchingChain(false);
    }
  }, [chainId, providerStatus, log, forceReinitProvider, signInWithWallet]);

  // One consolidated effect, split logically via guards:
  // - Once post-boot, refresh profile details (skip balances)
  // - When provider is ready, fetch balances once per (address, chainId)
  const lastBalancesFetchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isSignedIn || !user) return;
    // One-time enrich after boot hydration
    if (!isBootLoading && !didBootRefetchRef.current) {
      didBootRefetchRef.current = true;
      try { enrichAndStoreUser(user, { refetch: true }).catch(() => {}); } catch {}
    }
    // Balances fetch: run once when provider becomes ready for a given (address, chainId)
    // if (providerStatus !== "ready" || isSwitchingChain || !chainId ) return;
    if (providerStatus !== "ready") return;
    if (isSwitchingChain) return;
    if (!chainId) return; // ensure we only fetch for a known active chain
    const addr = user.walletAddress || user.address;
    if (!addr) return;
    const key = `${addr}-${chainId}`;
    if (lastBalancesFetchKeyRef.current === key) return; // already fetched for this combo
    lastBalancesFetchKeyRef.current = key;
    setBalancesLoading(true);
    try { fetchAndStoreBalances(user, chainId).catch(() => {}); } catch {}
  }, [isBootLoading, isSignedIn, user, providerStatus, isSwitchingChain, chainId, enrichAndStoreUser, fetchAndStoreBalances, setBalancesLoading]);
  // Sign-in, enrichment and local persistence moved into useAuthSession hook

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

  // Note: DM contacts/messages bootstrap is intentionally not done here to avoid
  // cross-domain coupling. See hooks/useDM for the canonical bootstrap flow.

  const requireAuth = useCallback((action: () => void) => {
    log.debug("requireAuth:called", { isSignedIn, needsUsername });
    if (isSignedIn && !needsUsername) action();
    else {
      setPendingAction(() => action);
      setShowSignInModal(true);
    }
  }, [isSignedIn, needsUsername, log]);

  // Skip auth method - allows users to use the app without signing in
  const skipAuthLocal = useCallback(async () => {
    await setHasSeenAuth();
    setIsFirstTimeUser(false);
  }, []);

  const patchUser: AuthContextType["patchUser"] = useCallback(async (update) => {
    const current = userRef.current;
    return await patchUserRaw(current as any, update as any);
  }, [patchUserRaw]);

  // === SPLIT CONTEXT VALUES (each memoized independently for performance) ===
  
  // User context - only updates when user object changes
  const userContextValue = useMemo<UserContextType>(() => ({
    user,
  }), [user]);

  // Auth state context - updates on auth state changes
  const authStateContextValue = useMemo<AuthStateContextType>(() => ({
    isLoading,
    isBootLoading,
    isSignedIn,
    isFirstTimeUser,
    needsUsername,
    provisionalUser,
    provisionalToken,
    balancesLoading,
  }), [isLoading, isBootLoading, isSignedIn, isFirstTimeUser, needsUsername, provisionalUser, provisionalToken, balancesLoading]);

  // Provider context - updates on wallet/chain changes
  const providerContextValue = useMemo<ProviderContextType>(() => ({
    provider,
    chainId,
    providerStatus,
    authMethod,
    isSwitchingChain,
  }), [provider, chainId, providerStatus, authMethod, isSwitchingChain]);

  // Stable refresh function wrapper
  const refreshUserStable = useCallback(async () => {
    if (userRef.current) await refreshUser(userRef.current);
  }, [refreshUser]);

  // Actions context - stable function references (rarely if ever changes)
  const authActionsContextValue = useMemo<AuthActionsContextType>(() => ({
    signOut,
    skipAuth: skipAuthLocal,
    signInWithWallet,
    completeUsername,
    refreshUser: refreshUserStable,
    requireAuth,
    patchUser,
    ensureProvider,
    ensureFreshProvider,
    switchChain,
  }), [signOut, skipAuthLocal, signInWithWallet, completeUsername, refreshUserStable, requireAuth, patchUser, ensureProvider, ensureFreshProvider, switchChain]);

  // Legacy combined context value (for backward compatibility with useAuth)
  const authContextValue: AuthContextType = useMemo(() => ({
    user,
    isLoading,
    isBootLoading,
    balancesLoading,
    isSignedIn,
    isFirstTimeUser,
    signOut,
    skipAuth: skipAuthLocal,
    signInWithWallet,
    needsUsername,
    provisionalUser,
    provisionalToken,
    completeUsername,
    refreshUser: refreshUserStable,
    requireAuth,
    patchUser,
    provider,
    chainId,
    providerStatus,
    ensureProvider,
    ensureFreshProvider,
    authMethod,
    switchChain,
    isSwitchingChain,
  }), [
    user,
    isLoading,
    isBootLoading,
    balancesLoading,
    isSignedIn,
    isFirstTimeUser,
    signOut,
    skipAuthLocal,
    signInWithWallet,
    needsUsername,
    provisionalUser,
    provisionalToken,
    completeUsername,
    refreshUserStable,
    requireAuth,
    patchUser,
    provider,
    chainId,
    providerStatus,
    ensureProvider,
    ensureFreshProvider,
    authMethod,
    switchChain,
    isSwitchingChain,
  ]);

  return (
    <UserContext.Provider value={userContextValue}>
      <AuthStateContext.Provider value={authStateContextValue}>
        <ProviderContext.Provider value={providerContextValue}>
          <AuthActionsContext.Provider value={authActionsContextValue}>
            <AuthContext.Provider value={authContextValue}>
              {children}
              {isSwitchingChain && (
                <FullScreenLoader message="Switching network…" />
              )}
              {/* SignIn modal for protected actions - shown when user needs to sign in */}
              {showSignInModal && !isSignedIn && !needsUsername && (
                <SignInGatewayModal
                  visible={showSignInModal}
                  onClose={() => {
                    setShowSignInModal(false);
                    setPendingAction(null);
                  }}
                />
              )}
              {/* Username modal - shown when user signed in via modal but needs username */}
              {showSignInModal && needsUsername && provisionalUser && (
                <UsernameRequiredModal
                  visible={true}
                  provisionalUser={provisionalUser}
                  onComplete={(finalUser) => {
                    completeUsername(finalUser);
                    // Modal will close automatically when needsUsername becomes false
                  }}
                />
              )}
            </AuthContext.Provider>
          </AuthActionsContext.Provider>
        </ProviderContext.Provider>
      </AuthStateContext.Provider>
    </UserContext.Provider>
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

// === OPTIMIZED SELECTOR HOOKS ===
// These hooks only subscribe to specific parts of the auth state,
// preventing unnecessary re-renders when unrelated state changes.

/**
 * Hook to access only user data. Components using this will only re-render
 * when the user object changes, not when loading states or provider changes.
 */
export const useUser = (): User | null => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within an AuthProvider");
  }
  return context.user;
};

/**
 * Hook to access auth state (loading, signed in status, etc).
 * Use this when you only need to check auth state without user details.
 */
export const useAuthState = (): AuthStateContextType => {
  const context = useContext(AuthStateContext);
  if (context === undefined) {
    throw new Error("useAuthState must be used within an AuthProvider");
  }
  return context;
};

/**
 * Hook to access web3 provider state.
 * Use this for wallet/chain related operations.
 */
export const useProvider = (): ProviderContextType => {
  const context = useContext(ProviderContext);
  if (context === undefined) {
    throw new Error("useProvider must be used within an AuthProvider");
  }
  return context;
};

/**
 * Hook to access auth actions (signOut, signIn, etc).
 * These are stable function references that rarely change.
 */
export const useAuthActions = (): AuthActionsContextType => {
  const context = useContext(AuthActionsContext);
  if (context === undefined) {
    throw new Error("useAuthActions must be used within an AuthProvider");
  }
  return context;
};

// Export types for external use
export type { 
  AuthContextType, 
  UserContextType, 
  AuthStateContextType, 
  ProviderContextType, 
  AuthActionsContextType 
};
