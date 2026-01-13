import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
  useMemo,
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
import { getPreferredChainId, setPreferredChainId } from "../libs/auth.utils";
import { AuthService } from "../services";
  // --- Chain switching (centralized) --------------------------------------
  import { SUPPORTED_NETWORKS, supportedNetworks } from "../config/web3.constants";
  import { setLocalAuthChainId } from "../services/auth/localProviderAdapter";
  import { clearSigningProvider } from "../libs/provider.registry";
  import { addWeb3AuthChain, switchWeb3AuthChain, reconfigureWeb3AuthChain } from "../config/web3auth.config";
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

// Create the context with a default value
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


  const toHexChainId = (id: number) => '0x' + Number(id).toString(16);

  // Poll the actual provider for eth_chainId to avoid React state closure races
  const waitForChain = useCallback(async (targetId: number, timeoutMs = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        let raw: any = undefined;
        if (provider && typeof (provider as any).request === 'function') {
          raw = await (provider as any).request({ method: 'eth_chainId' });
        }
        if (!raw) raw = (provider as any)?.chainConfig?.chainId;
        const current = typeof raw === 'string' && raw.startsWith('0x') ? parseInt(raw, 16) : Number(raw);
        if (!Number.isNaN(current) && current === targetId) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }, [provider]);

  const switchChain = useCallback(async (targetChainId: number) => {
    if (!targetChainId) return;
    if (chainId === targetChainId && providerStatus === 'ready') return;
    setIsSwitchingChain(true);
    try {
      const currentMethod = authMethod;
      const hex = toHexChainId(targetChainId);
      log.info('switchChain:start', { method: currentMethod, targetChainId, hex, providerReady: !!provider });
      // Web3Auth / AA path: disable wallet_add/switch and SDK switch; rely solely on reconfigure()
      if (currentMethod === 'web3auth') {
        log.info('switchChain:web3auth:reconfigure-only:start', { targetChainId, hex });
        try {
          const updated = await reconfigureWeb3AuthChain(targetChainId);
          log.info('switchChain:web3auth:reconfigure-only:done', { updated, targetChainId });
        } catch (e) {
          log.warn('switchChain:web3auth:reconfigure-only:error', e as any);
          throw e;
        }
      } else {
        // Local (private key) path: set override and re-init provider
        try { setLocalAuthChainId(targetChainId); log.debug('switchChain:local:setChainOverride', { targetChainId }); } catch {}
        try { clearSigningProvider(); log.debug('switchChain:local:clearSigningProvider'); } catch {}
        resetProviderState();
        await ensureProvider();
      }
      // Wait for chain and provider to settle
      const ok = await waitForChain(targetChainId, 20000);
      log.info('switchChain:waitForChain', { targetChainId, ok });
      if (!ok) {
        // Try validating and reinit once more
        log.warn('switchChain:waitForChain:retry:ensureFreshProvider');
        await ensureFreshProvider();
        // Give the provider a brief moment to settle before proceeding
        const ok2 = await waitForChain(targetChainId, 5000);
        log.info('switchChain:waitForChain:second', { targetChainId, ok: ok2 });
      }
      // Re-authenticate on the new chain (no enrichment or balance fetch; app will restart)
      if (userRef.current) {
        const addr = userRef.current.walletAddress || userRef.current.address;
        if (addr) {
          try {
            log.debug('switchChain:reauth:start', { addr: `${addr.slice(0,6)}...${addr.slice(-4)}`, targetChainId });
            await AuthService.signInWithWallet(addr, targetChainId);
            log.debug('switchChain:reauth:done', { targetChainId });
          } catch (reauthErr) {
            log.warn('switchChain:reauth:error', reauthErr as any);
          }
        }
      }
      try { await setPreferredChainId(targetChainId); log.debug('switchChain:persistPreferred:ok', { targetChainId }); } catch {}
      try {
        const name = SUPPORTED_NETWORKS?.[targetChainId]?.chainName || `Chain ${targetChainId}`;
        toastSuccess(`Switched to ${name}`);
      } catch {}
    } catch (e) {
      log.error('switchChain:failed', e as any);
      try { toastError(e, 'Failed to switch network'); } catch {}
      throw e;
    } finally {
      setIsSwitchingChain(false);
    }
  }, [authMethod, provider, ensureProvider, ensureFreshProvider, resetProviderState, waitForChain, fetchAndStoreBalances]);

  // Enforce preferred chain once when provider first becomes ready (boot restore)
  useEffect(() => {
    if (appliedPreferredRef.current) return;
    if (!provider || providerStatus !== 'ready') return;
    const preferred = preferredChainRef.current;
    if (!preferred) return;
    // For local auth, LocalProviderAdapter already initializes on preferred chain; avoid switch overlay
    if (authMethod === 'local') {
      appliedPreferredRef.current = true;
      return;
    }
    if (chainId === preferred) {
      appliedPreferredRef.current = true;
      return;
    }
    appliedPreferredRef.current = true;
    // Web3Auth path: switch after ready (may show overlay)
            log.debug('useEffect:chain:switch:done', { preffered: preferredChainRef.current, applied: appliedPreferredRef.current, chainId });
    switchChain(preferred).catch(() => {});
  }, [provider, providerStatus, chainId, switchChain, authMethod]);

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

  // console.log("[AuthContext]", { provider });
  // if (provider && !("signer" in (provider as any))) {
  //   // EIP-1193 providers do not expose a signer property; ethers derives it via Web3Provider
  //   console.log(
  //     "[AuthContext] Provider is EIP-1193; .signer not present (expected). Ethers will create a Signer via Web3Provider."
  //   );
  // }

  // Create the context value object
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
    refreshUser: async () => { if (userRef.current) await refreshUser(userRef.current); },
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
    refreshUser,
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
