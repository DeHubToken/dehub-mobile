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
import { setLogUserAddress } from "../libs/errorReporter";
import { getSigningProvider, clearSigningProvider } from "../libs/provider.registry";
import { useProviderLifecycle, type EIP1193Provider, type ProviderStatus } from "../hooks/useProviderLifecycle";
import { useBalances } from "../hooks/useBalances";
import { useAuthBoot } from "../hooks/useAuthBoot";
import { useAuthSession, type SupabaseSessionExchangeResult } from "../hooks/useAuthSession";
import FullScreenLoader from "../components/FullScreenLoader";
import { toastSuccess, toastError } from "../libs";
import {
  getPreferredChainId,
  setPreferredChainId,
  clearAuthSignature,
} from "../libs/auth.utils";
import { SUPPORTED_NETWORKS, supportedNetworks } from "../config/web3.constants";
import { setLocalAuthChainId } from "../services/auth/localProviderAdapter";
import { setViewAccount } from "../services/view.service";
import { tokenRefreshManager } from "../libs/token-refresh";
import { clearPersistedNavigationState } from "../hooks/useNavigationPersistence";
import {
  currentProfileId,
  beginAddProfileAttempt,
  restoreDisplacedProfileIfAny,
  beginProfileSwitch,
  completeProfileSwitch,
  abortProfileSwitch,
  snapshotCurrentSession,
} from "../libs/profiles";

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
  /**
   * A verified ENS name, e.g. `mal.eth`, proved at /ens/link.
   *
   * An ALIAS, never the username: it adds dehub.io/mal.eth as a second URL and
   * a chip on the profile, and `username` above is untouched by it. Present
   * only when the account has one, and never client-writable — it is
   * deliberately absent from what /update_profile accepts, because an entry
   * there would hand out `vitalik.eth` for a POST with no signature at all.
   */
  ensName?: string | null;
  /** When that name was last proven against Ethereum. */
  ensVerifiedAt?: string | null;
  badgeBalance?: number; // backend-computed badge balance
  /**
   * What the chain says this wallet owns — held plus staked, on Base and BNB.
   *
   * Use this, not `badgeBalance`, anywhere the number is presented as the
   * user's own DHB: `badgeBalance` is the rendered badge figure and a
   * delegation can hold it above what the wallet actually holds. Absent until
   * the account's next chain read, so readers need a fallback.
   */
  ownBadgeBalance?: number;
  stakedDHB?: number;
  uploads?: number;
  followers?: number; // count of followers
  followings?: number; // count of following
  hideFollowers?: boolean; // privacy setting to hide follow lists
  isPrivate?: boolean; // privacy setting to make account private
  /**
   * This viewer asked to be served mature posts in the public feeds, and to
   * see them without a content warning elsewhere. Off by default. Says
   * nothing about their own posts, which carry their own rating.
   */
  showMatureContent?: boolean;
  /**
   * Free-form profile settings blob returned by the account endpoints. Web
   * keeps follow visibility (`followVisibility`), default post visibility
   * (`defaultPostVisibility`) and default profile tab (`defaultProfileTab`) in
   * here — see dehubweb src/hooks/use-privacy-settings.ts. PrivacySettingsScreen
   * reads and writes the same keys so both clients agree.
   */
  customs?: Record<string, string>;
  likes?: string[];
  unlocked?: string[];
  createdAt?: string;
  info?: { walletBalances?: { [key: string]: number } };
  dmSettings?: {
    address: string;
    disables: ("NEW_DM" | "ALL" | "ACTIVE_ALL")[];
    perMessageFee: number;
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
  signInWithWallet: (walletAddress: string, chainId: number, overridePrivateKey?: string, web3AuthMeta?: Record<string, any>) => Promise<void>;
  /**
   * Try to sign in from an existing Supabase session (Google/email) alone —
   * no wallet signature. Resolves to true only if this Supabase identity is
   * already linked to an account (and, when expectedAddress is passed, that
   * account matches it); false means the caller should fall back to
   * signInWithWallet (which is what establishes the link on first login).
   */
  signInWithSupabaseSession: (
    supabaseAccessToken: string,
    chainId: number,
    expectedAddress?: string,
    supabaseUserId?: string
  ) => Promise<SupabaseSessionExchangeResult>;
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
  authMethod?: 'local' | null;
  // Switch active chain and block UI until done
  switchChain: (targetChainId: number) => Promise<void>;
  isSwitchingChain?: boolean;
  /** Open the sign-in sheet to save another account on this device. */
  openAddProfile: () => void;
  /** Become another profile saved on this device. */
  switchToProfile: (id: string) => Promise<boolean>;
  // Add more auth methods as needed
}

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
  authMethod?: 'local' | null;
  isSwitchingChain?: boolean;
}

// Auth actions context (never updates - stable function references)
interface AuthActionsContextType {
  signOut: () => Promise<void>;
  skipAuth: () => Promise<void>;
  signInWithWallet: (walletAddress: string, chainId: number, overridePrivateKey?: string, web3AuthMeta?: Record<string, any>) => Promise<void>;
  /**
   * Try to sign in from an existing Supabase session (Google/email) alone —
   * no wallet signature. Resolves to true only if this Supabase identity is
   * already linked to an account (and, when expectedAddress is passed, that
   * account matches it); false means the caller should fall back to
   * signInWithWallet (which is what establishes the link on first login).
   */
  signInWithSupabaseSession: (
    supabaseAccessToken: string,
    chainId: number,
    expectedAddress?: string,
    supabaseUserId?: string
  ) => Promise<SupabaseSessionExchangeResult>;
  completeUsername: (finalUser: User) => void;
  refreshUser: () => Promise<void>;
  requireAuth: (action: () => void) => void;
  patchUser: (update: Partial<User> | ((prev: User) => Partial<User>)) => Promise<User | null>;
  ensureProvider: () => Promise<void>;
  ensureFreshProvider: () => Promise<void>;
  switchChain: (targetChainId: number) => Promise<void>;
  /** Open the sign-in sheet to save another account on this device. */
  openAddProfile: () => void;
  /** Become another profile saved on this device. */
  switchToProfile: (id: string) => Promise<boolean>;
}

// Create split contexts
export const UserContext = createContext<UserContextType | undefined>(undefined);
export const AuthStateContext = createContext<AuthStateContextType | undefined>(undefined);
export const ProviderContext = createContext<ProviderContextType | undefined>(undefined);
export const AuthActionsContext = createContext<AuthActionsContextType | undefined>(undefined);

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
  // True while the sheet was opened from "Add profile" — it must then render
  // even though the user is signed in, and closing it restores whoever the
  // attempt displaced.
  const [addProfileIntent, setAddProfileIntent] = useState(false);
  const [authMethod, setAuthMethodState] = useState<'local' | null>(null);
  const isMountedRef = useRef(true);
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);
  const preferredChainRef = useRef<number | null>(null);
  const appliedPreferredRef = useRef(false);
  const authAdapterRef = useRef<AuthAdapter | null>(null);
  // Keep user in ref for async flows
  const userRef = useRef<User | null>(null);
  useEffect(() => {
    userRef.current = user;
    // Scope view-dedup storage to the signed-in account — without this the
    // previous account's 24h cooldowns suppress the next account's views.
    setViewAccount(user?.address ?? null);
  }, [user]);
  // Refs for stable callback access (avoid re-creating requireAuth/switchChain on state changes)
  const isSignedInRef = useRef(isSignedIn);
  useEffect(() => { isSignedInRef.current = isSignedIn; }, [isSignedIn]);
  const needsUsernameRef = useRef(needsUsername);
  useEffect(() => { needsUsernameRef.current = needsUsername; }, [needsUsername]);
  const chainIdRef = useRef<number | undefined>(undefined);
  const providerStatusRef = useRef<ProviderStatus>('idle' as ProviderStatus);
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
  useEffect(() => { chainIdRef.current = chainId; }, [chainId]);
  useEffect(() => { providerStatusRef.current = providerStatus; }, [providerStatus]);

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

  // Tag error rows with whoever hit them. Without it every crash in
  // client_error_logs is anonymous and cannot be tied back to a report.
  useEffect(() => {
    setLogUserAddress(user?.walletAddress || user?.address || null);
  }, [user?.address, user?.walletAddress]);

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


  // Auto ensure freshness when provider becomes ready while signed in
  useEffect(() => {
    if (isSignedIn && providerStatus === "ready" && provider) {
      ensureFreshProvider().catch(() => {});
    }
  }, [isSignedIn, providerStatus, provider, ensureFreshProvider]);

  // One consolidated effect is declared later, after useAuthSession exposes enrichAndStoreUser
  const didBootRefetchRef = useRef(false);

  // Helpers
  // Removed retry/timeout helpers to simplify provider setup per docs.

  // Session management and actions
  const {
    signInWithWallet,
    signInWithSupabaseSession,
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
    forceReinitProvider,
    adoptProvider,
    fetchAndStoreBalances,
    clearAuthData,
    providerReset: resetProviderState,
    isMountedRef,
    setAuthMethodState,
    didBootRefetchRef,
  });
  // Update session-expired handler ref
  useEffect(() => { sessionExpiredHandlerRef.current = handleSessionExpired; }, [handleSessionExpired]);

  /** Who the freshly built provider actually signs as. */
  const getProviderAccount = useCallback(async (): Promise<string | null> => {
    try {
      const prov: any = getSigningProvider();
      const accounts = await prov?.request?.({ method: 'eth_accounts' });
      return Array.isArray(accounts) && accounts[0] ? String(accounts[0]) : null;
    } catch {
      return null;
    }
  }, []);

  // In-place chain switch: persist the new preference, rebuild the local
  // provider on the target chain, and re-authenticate — all without restarting
  // the app, and all undone again if any step of it fails.
  const switchChain = useCallback(async (targetChainId: number) => {
    if (!targetChainId) return;
    if (chainIdRef.current === targetChainId && providerStatusRef.current === 'ready') return;
    const chainName =
      (SUPPORTED_NETWORKS as any)?.[targetChainId]?.chainName || `Chain ${targetChainId}`;
    const previousChainId = chainIdRef.current ?? (await getPreferredChainId());
    setIsSwitchingChain(true);
    try {
      const address = userRef.current?.walletAddress || userRef.current?.address;
      log.info('switchChain:start', { targetChainId, currentChainId: chainIdRef.current, address: address ? `${address.slice(0,6)}...${address.slice(-4)}` : undefined });

      // 1. Persist preference (cold boots use this chain, and so does the
      //    provider rebuilt in step 3 — it reads the preference to decide
      //    which chain to build on)
      await setPreferredChainId(targetChainId);
      try { setLocalAuthChainId(targetChainId); } catch {}

      // 2. Drop the cached signature so the new session signs fresh — this app
      //    accepts a stored signature for 30 days, the backend for 24 hours.
      //    The auth TOKEN deliberately survives until the new one lands: wiping
      //    it here left a failed switch with no session at all, so the next
      //    request 401'd and the app demanded a fresh sign-in.
      await clearAuthSignature();

      // 3. Tear down and rebuild the provider on the new chain.
      //    forceReinitProvider bypasses the stale-closure guard in ensureProvider,
      //    clears the cached authAdapter and the signing-provider override, and calls
      //    internalInitializeProvider directly (which rebuilds the local EIP-1193
      //    provider from the persisted preferred chain id).
      await forceReinitProvider();

      // 4. Re-authenticate with the backend on the new chain
      if (address) {
        // A smart-account identity has no Safe on a chain AA isn't configured
        // for, so step 3 falls back to the bare EOA there. Signing as one
        // address while the payload claims the other is rejected outright, and
        // going through with it would file every later post from a different
        // backend account — the identity split completeLocalSignIn exists to
        // prevent. Refuse the chain rather than half-perform the switch.
        const signingAddress = await getProviderAccount();
        if (signingAddress && signingAddress.toLowerCase() !== address.toLowerCase()) {
          throw new Error(`${chainName} is not available for this account.`);
        }
        await signInWithWallet(address, targetChainId);
        log.info('switchChain:reauth:success', { targetChainId });
      }

      try { toastSuccess(`Switched to ${chainName}`); } catch {}
    } catch (e) {
      log.error('switchChain:failed', e as any);
      // Put the wallet back on the chain it came from. Persisting the target up
      // front and never undoing it is what stranded accounts on a chain they
      // could not authenticate on: the preference outlives the failure, so every
      // launch afterwards rebuilt from it and every escape attempt failed the
      // same way.
      if (typeof previousChainId === 'number' && previousChainId !== targetChainId) {
        try {
          await setPreferredChainId(previousChainId);
          try { setLocalAuthChainId(previousChainId); } catch {}
          await forceReinitProvider();
        } catch (restoreError) {
          log.error('switchChain:restore:failed', restoreError as any);
        }
      }
      try { toastError(e, 'Failed to switch network'); } catch {}
      throw e;
    } finally {
      setIsSwitchingChain(false);
    }
  }, [log, forceReinitProvider, getProviderAccount, signInWithWallet]);

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

  const requireAuth = useCallback((action: () => void) => {
    log.debug("requireAuth:called", { isSignedIn: isSignedInRef.current, needsUsername: needsUsernameRef.current });
    if (isSignedInRef.current && !needsUsernameRef.current) action();
    else {
      setPendingAction(() => action);
      setShowSignInModal(true);
    }
  }, [log]);

  // ── Multi-account (profiles) ──────────────────────────────────────────────
  // Rehydrate React state from the session keys currently on disk. Mobile has
  // no page reload to lean on (dehubweb reloads after a switch), so the same
  // "boot already knows how to hydrate a key set" idea runs in place.
  const rehydrateFromStorage = useCallback(async () => {
    const restoredUser = await getAuthUser<User>();
    setUser(restoredUser);
    setIsSignedIn(!!restoredUser);
    setNeedsUsername(false);
    setProvisionalUser(null);
    setProvisionalToken(null);
    setBalancesLoading(false);
    didBootRefetchRef.current = true;
    resetProviderState();
    clearSigningProvider();
    try {
      await forceReinitProvider();
    } catch {}
    clearPersistedNavigationState();
  }, [resetProviderState, forceReinitProvider]);

  /**
   * The address that was live when Add profile opened.
   *
   * The completion effect below needs to know that a DIFFERENT account is now
   * signed in. It cannot ask "are we signed in", because we already were —
   * that is the whole point of adding a second profile — so testing that alone
   * made the effect fire on the same state change that opened the sheet.
   */
  const addProfileFromRef = useRef<string | null>(null);

  const openAddProfile = useCallback(() => {
    // Record who is live before anything in the sheet can displace them, so
    // abandoning the attempt can put everything back exactly as it was.
    beginAddProfileAttempt().catch(() => {});
    addProfileFromRef.current =
      (userRef.current?.walletAddress || userRef.current?.address || null)?.toLowerCase() ?? null;
    setAddProfileIntent(true);
    setShowSignInModal(true);
  }, []);

  /**
   * Become another profile saved on this device. Silent when its stored
   * session restores; otherwise the sign-in sheet opens ("Add a profile") and
   * completing it lands on that account.
   */
  const switchToProfile = useCallback(
    async (id: string): Promise<boolean> => {
      if (!id) return false;
      const prevId = await currentProfileId();
      if (!prevId || id === prevId) return true;
      // Freshen the outgoing account's stash first: refresh tokens rotate on
      // use, and the snapshot must hold the one still live server-side.
      try {
        await tokenRefreshManager.ensureFreshToken();
      } catch {}
      log.info('switchToProfile:start', { from: `${prevId.slice(0, 12)}...`, to: `${id.slice(0, 12)}...` });
      const plan = await beginProfileSwitch(id);
      if (!plan) {
        openAddProfile();
        return false;
      }
      try {
        if (plan.supabase) {
          // Re-seats AND persists the stored Supabase session; raced against a
          // timeout because a hung restore would leave the snapshot guard set
          // and every later tracking write blocked.
          const { supabase } = await import('../services/supabase');
          await Promise.race([
            supabase.auth.setSession({
              access_token: plan.supabase.access_token,
              refresh_token: plan.supabase.refresh_token,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Supabase session restore timed out')), 10_000)
            ),
          ]);
        }
        await rehydrateFromStorage();
        await completeProfileSwitch(id);
        toastSuccess('Switched account');
        return true;
      } catch (e) {
        log.warn('switchToProfile:failed', e as any);
        await abortProfileSwitch(prevId);
        await rehydrateFromStorage();
        toastError?.('Could not switch account');
        return false;
      }
    },
    [log, openAddProfile, rehydrateFromStorage]
  );

  useEffect(() => {
    // Keep the live account's registry copy fresh across background refreshes.
    return tokenRefreshManager.onTokenRefreshed(() => {
      snapshotCurrentSession().catch(() => {});
    });
  }, []);

  // A completed Add profile attempt (a DIFFERENT account is now live) closes
  // the sheet and drops the intent — otherwise the gateway would stay open
  // over a freshly signed-in session.
  //
  // The identity check is what makes this an event rather than a state. Adding
  // a profile starts from a signed-in session, so `isSignedIn && intent` was
  // already true the moment openAddProfile set the intent: the effect ran on
  // that very change, cleared both flags, and the sheet unmounted before
  // anyone could type anything. Multi-account sign-in was unreachable.
  const currentAddress = (user?.walletAddress || user?.address || null)?.toLowerCase() ?? null;
  useEffect(() => {
    if (!isSignedIn || !addProfileIntent) return;
    // Nothing concrete to compare yet — the user object repopulates in stages
    // during a sign-in, and a momentarily absent address is not a new account.
    if (!currentAddress) return;
    // Still the same account: the attempt has not completed yet.
    if (currentAddress === addProfileFromRef.current) return;
    addProfileFromRef.current = null;
    setAddProfileIntent(false);
    setShowSignInModal(false);
  }, [isSignedIn, addProfileIntent, currentAddress]);

  // Skip auth method - allows users to use the app without signing in
  const skipAuthLocal = useCallback(async () => {
    await setHasSeenAuth();
    setIsFirstTimeUser(false);
  }, []);

  const patchUser: AuthContextType["patchUser"] = useCallback(async (update) => {
    const current = userRef.current;
    return await patchUserRaw(current as any, update as any);
  }, [patchUserRaw]);

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
    signInWithSupabaseSession,
    completeUsername,
    refreshUser: refreshUserStable,
    requireAuth,
    patchUser,
    ensureProvider,
    ensureFreshProvider,
    switchChain,
    openAddProfile,
    switchToProfile,
  }), [signOut, skipAuthLocal, signInWithWallet, signInWithSupabaseSession, completeUsername, refreshUserStable, requireAuth, patchUser, ensureProvider, ensureFreshProvider, switchChain, openAddProfile, switchToProfile]);

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
    signInWithSupabaseSession,
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
    openAddProfile,
    switchToProfile,
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
    signInWithSupabaseSession,
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
    openAddProfile,
    switchToProfile,
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
              {(showSignInModal && !needsUsername && (addProfileIntent || (!isSignedIn))) && (
                <SignInGatewayModal
                  visible={showSignInModal}
                  onClose={() => {
                    setShowSignInModal(false);
                    setPendingAction(null);
                    // An abandoned Add profile attempt gets undone, not just
                    // closed: if the flow already displaced the live account
                    // (staging ran, or the exchange started writing), the
                    // previous account's snapshot goes back on disk, state
                    // rehydrates into it, and closing the sheet costs nothing.
                    //
                    // Not gated on addProfileIntent any more: an ordinary
                    // sign-in as somebody else displaces the live account just
                    // as thoroughly, and abandoning it there used to leave the
                    // phone signed in as nobody. The call itself no-ops when
                    // nothing was displaced.
                    setAddProfileIntent(false);
                    {
                      restoreDisplacedProfileIfAny()
                        .then(async (restored) => {
                          if (restored) {
                            if (restored.supabase) {
                              try {
                                const { supabase } = await import('../services/supabase');
                                await supabase.auth.setSession({
                                  access_token: restored.supabase.access_token,
                                  refresh_token: restored.supabase.refresh_token,
                                });
                              } catch {}
                            }
                            await rehydrateFromStorage();
                          }
                        })
                        .catch(() => {});
                    }
                  }}
                />
              )}
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

export const useUser = (): User | null => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within an AuthProvider");
  }
  return context.user;
};

export const useAuthState = (): AuthStateContextType => {
  const context = useContext(AuthStateContext);
  if (context === undefined) {
    throw new Error("useAuthState must be used within an AuthProvider");
  }
  return context;
};

export const useProvider = (): ProviderContextType => {
  const context = useContext(ProviderContext);
  if (context === undefined) {
    throw new Error("useProvider must be used within an AuthProvider");
  }
  return context;
};

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
