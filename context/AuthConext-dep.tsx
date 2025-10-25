import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
} from "react";
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
import { createLogger } from "../libs/logger";
import { getSigningProvider } from "../libs/provider.registry";
import { getLocalAccountDetails, upsertLocalAccount, getLocalAccount } from "../libs/wallets.local";
import { createLocalEip1193Provider } from "../services/localwallet.provider";
import { SUPPORTED_NETWORKS } from "../config/web3.constants";
import { ChainId } from "../config/constants";

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
  // Background token balances loading
  balancesLoading: boolean;
  isSignedIn: boolean;
  isFirstTimeUser: boolean;
  signOut: () => Promise<void>;
  skipAuth: () => Promise<void>;
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
  const log = createLogger("AuthContext");
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

  // Logging handled via createLogger; set DEBUG env var to enable debug-level logs.

  // console.log({user, provider})
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // log.debug("unmount");
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
        log.debug("eth_accounts:failed", e);
        return null;
      }
    },
    [log]
  );

  // Background fetch for balances to avoid blocking sign-in
  const fetchAndStoreBalances = useCallback(async (u: User) => {
    try {
      setBalancesLoading(true);
      const addr = u?.walletAddress || u?.address;
      if (!addr) return;
      const BASE_CHAIN_ID = 8453; // Base mainnet
      const symbols = ["DHB", "USDC", "USDT", "WETH"];
      const t0 = Date.now();
      log.debug("balances:bg:start", { addr, symbols });
      const balances = await ethersService.getTokenBalances(
        addr,
        BASE_CHAIN_ID,
        symbols
      );
      setUser((prev) => {
        const merged: User | null = prev
          ? ({
              ...(prev as User),
              tokenBalances: {
                ...((prev as User)?.tokenBalances || {}),
                ...balances,
              },
            } as User)
          : prev;
        if (merged) setAuthUser(merged).catch(() => {});
        return merged;
      });
      log.debug("balances:bg:done", {
        addr,
        ms: Date.now() - t0,
      });
    } catch (e) {
      log.warn("balances:bg:error", e);
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  const attachProviderEventListeners = useCallback((prov: any) => {
    try {
      prov?.on?.("chainChanged", (next: any) => {
        const parsed =
          typeof next === "string" && next.startsWith("0x")
            ? parseInt(next, 16)
            : Number(next);
        // log.info("provider:event:chainChanged", { next, parsed });
        if (!Number.isNaN(parsed)) setChainId(parsed);
      });
    } catch (e) {
      console.warn("[AuthContext] chainChanged listener attach failed", e);
    }
    try {
      prov?.on?.("accountsChanged", (accs: string[]) => {
        // log.info("provider:event:accountsChanged", { count: accs?.length || 0 });
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
        log.warn("provider:event:disconnect", err?.message || err);
        validateAndMaybeReinit("disconnect");
      });
    } catch (e) {
      /* ignore */
    }
  }, []);

  // --- Helpers: chainId parsing and provider adoption ------------------------
  const parseChainId = useCallback((raw: any): number | undefined => {
    try {
      const parsed =
        typeof raw === "string" && raw?.startsWith?.("0x")
          ? parseInt(raw, 16)
          : Number(raw);
      return Number.isNaN(parsed) ? undefined : parsed;
    } catch {
      return undefined;
    }
  }, []);

  const adoptProvider = useCallback(
    async (prov: any, opts?: { setReady?: boolean }) => {
      if (!prov) return;
      // Set chain id if available
      try {
        let raw: any;
        if (typeof prov?.request === "function") {
          raw = await prov.request({ method: "eth_chainId" });
        }
        if (!raw) raw = prov?.chainConfig?.chainId;
        const parsed = parseChainId(raw);
        if (parsed !== undefined) setChainId(parsed);
      } catch {}
      attachProviderEventListeners(prov);
      setProvider(prov);
      if (opts?.setReady ?? true) {
        setProviderStatus("ready");
      }
    },
    [attachProviderEventListeners, parseChainId]
  );

  const internalInitializeProvider = useCallback(async () => {
    // log.info("provider:init:start");
    setProviderStatus("initializing");
    const startTs = Date.now();
    try {
      // 1) Prefer any one-off local provider already registered (e.g., during import)
      const injected = getSigningProvider();
      if (injected && typeof injected.request === "function") {
        await adoptProvider(injected);
        return;
      }

      // 2) If signed in and a local private key exists for this user, build a local provider
      const activeAddr = user?.walletAddress || user?.address;
      if (activeAddr) {
        try {
          const details = await getLocalAccountDetails(activeAddr);
          if (details?.privateKey) {
            const net = SUPPORTED_NETWORKS[ChainId.BASE_MAINNET];
            const rpcUrl = net?.rpcUrls?.[0] || "https://mainnet.base.org";
            const chainIdHex = net?.chainId || "0x2105";
            const local = createLocalEip1193Provider({
              privateKey: details.privateKey,
              rpcUrl,
              chainIdHex,
            });
            await adoptProvider(local);
            return;
          }
        } catch {}
      }

      // 3) Fallback to configured auth adapter (Web3Auth or Privy)
      if (!authAdapterRef.current) authAdapterRef.current = createAuthAdapter();
      const eip1193 = await authAdapterRef.current.getProvider();
      if (!eip1193)
        throw new Error("getWeb3AuthProvider returned null/undefined");
      if (!isMountedRef.current) return;
      // Adopt without forcing ready; let remaining init finish
      await adoptProvider(eip1193, { setReady: false });
      providerGenerationRef.current += 1;
      // log.info("provider:init:got-provider", { gen: providerGenerationRef.current });

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
        // log.debug("provider:init:chainId", { rawChainId, parsed });
      } catch (e) {
        console.warn("[AuthContext] chainId fetch failed", e);
        log.warn("provider:init:chainId:error", e);
      }

      attachProviderEventListeners(eip1193);

      // Initial account validation (non-blocking reinit if missing)
      const accounts = await fetchAccounts(eip1193);
      // log.debug("provider:init:eth_accounts", { count: accounts?.length || 0 });
      if (!accounts || accounts.length === 0) {
        log.warn("provider:init:accounts:empty:schedule-validate");
        setTimeout(
          () => validateAndMaybeReinit("initial-accounts-empty"),
          1500
        );
      }

      setProviderStatus("ready");
      // log.info("provider:init:ready", { ms: Date.now() - startTs, gen: providerGenerationRef.current });
    } catch (e) {
      console.error("[AuthContext] internalInitializeProvider failed", e);
      log.error("provider:init:error", e);
      setProviderStatus("error");
      throw e;
    }
  }, [attachProviderEventListeners, fetchAccounts, log]);

  const attemptReinitializeProvider = useCallback(
    async (reason: string) => {
      const now = Date.now();
      if (now - lastReinitTsRef.current < REINIT_BACKOFF_MS) {
        // log.debug("reinit:suppressed", { reason });
        return;
      }
      lastReinitTsRef.current = now;
      // log.info("reinit:attempt", { reason });
      setProvider(null);
      setProviderStatus("idle");
      try {
        await internalInitializeProvider();
      } catch (e) {
        console.warn("[AuthContext] reinit failed", e);
        log.warn("reinit:failed", e);
      }
    },
    [internalInitializeProvider]
  );

  // Sign out method (moved earlier so other callbacks can depend on it safely)
  const signOut = useCallback(async () => {
    // log.info("signOut:start");
    setIsLoading(true);
    try {
      await clearAuthData();
      setUser(null);
      setIsSignedIn(false);
      setBalancesLoading(false);
      setProvider(null);
      setChainId(undefined);
      setProviderStatus("idle");
    } catch (error) {
      console.error("Sign out error:", error);
      log.error("signOut:error", error);
      throw error;
    } finally {
      setIsLoading(false);
      // log.info("signOut:done");
    }
  }, []);

  const handleSessionExpired = useCallback(
    async (trigger: string) => {
      console.warn("[AuthContext] Session expired detected", trigger);
      log.warn("session:expired", { trigger });
      toastError?.("Session expired, login again");
      try {
        await signOut();
      } catch (e) {
        console.warn("[AuthContext] signOut during session expire failed", e);
        log.warn("session:expired:signOut:failed", e);
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
          log.warn("validate:empty-accounts", { reason });
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
              log.warn("validate:session-expired:threshold-reached", {
                count: consecutiveEmptyAccountsRef.current,
              });
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
    [provider, providerStatus, fetchAccounts, attemptReinitializeProvider]
  );

  const ensureProvider = useCallback(async () => {
    // log.debug("ensureProvider:entry", { hasProvider: !!provider, status: providerStatus, inFlight: !!providerInitInFlightRef.current });
    if (provider || providerStatus === "ready") return;
    if (providerInitInFlightRef.current) return providerInitInFlightRef.current;
    const init = internalInitializeProvider();
    providerInitInFlightRef.current = init;
    await init.finally(() => {
      providerInitInFlightRef.current = null;
      // log.debug("ensureProvider:done");
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
      // log.info("boot:loadAuthState:start");
      try {
        const [userData, token, seenAuth] = await Promise.all([
          getAuthUser<User>(),
          getAuthToken(),
          hasSeenAuth(),
        ]);
        // log.debug("boot:loadAuthState:fetched", { hasUser: !!userData, hasToken: !!token, seenAuth });
        if (userData && token) {
          setUser(userData);
          setIsSignedIn(true);
          // Initialize provider in background (non-blocking)
          ensureProvider()
            // .then(() => log.debug("boot:ensureProvider:ok"))
            .catch((e) => {
              console.warn("[AuthContext] provider init during boot failed", e);
              log.warn("boot:ensureProvider:failed", e);
            });
          // log.info("boot:hydrated:user");
        }
        if (seenAuth) setIsFirstTimeUser(false);
      } catch (e) {
        console.error("Failed to load auth state:", e);
        log.error("boot:loadAuthState:error", e);
      } finally {
        setIsBootLoading(false);
        // log.info("boot:loadAuthState:done");
      }
    };
    loadAuthState();
  }, [ensureProvider]);

  // AppState resume validation
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      log.debug("appstate:change", { prev, next });
      if (prev.match(/inactive|background/) && next === "active") {
        log.info("app-resume:validate");
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
    const mask = (addr?: string) =>
      addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : undefined;
    log.info("signInWithWallet:start", {
      walletAddress: mask(walletAddress),
      chainId,
    });
    setIsLoading(true);
    try {
      // console.log("[AuthContext] signInWithWallet called", {
      //   walletAddress,
      //   chainId,
      // });
      // Try to retrieve private key only when NOT using a local override provider
      // For local private-key flow, we already have the key and do not need to send/pass it here
      const hasOverride = !!getSigningProvider();
      let privateKey: string | undefined;
      if (!hasOverride) {
        try {
          if (!authAdapterRef.current)
            authAdapterRef.current = createAuthAdapter();
          log.debug("getPrivateKey:begin");
          privateKey = await authAdapterRef.current.getPrivateKey?.();
          log.debug("getPrivateKey:done", {
            hasKey: !!privateKey,
            length: privateKey?.length || 0,
          });
        } catch (e) {
          console.warn("[AuthContext] adapter.getPrivateKey failed", e);
          log.warn("getPrivateKey:error", e);
        }
      }
      log.info("backend:signInWithWallet:request");
      const {
        user: walletUser,
        token,
        needsUsername: need,
      } = await AuthService.signInWithWallet(
        walletAddress,
        chainId,
        hasOverride ? undefined : { privateKey }
      );
      log.info("backend:signInWithWallet:success", {
        needsUsername: need,
        userId: walletUser?.address,
      });
      // Initialize provider now that we have a session
      setProvider(null);
      setChainId(chainId);
      try {
        // If a one-off local signing provider was supplied (e.g., from ImportWallet), adopt it
        const override = getSigningProvider();
        if (override && typeof override.request === "function") {
          log.info("provider:override:adopt");
          await adoptProvider(override);
        } else {
          log.info("ensureProvider:start");
          await ensureProvider();
          log.info("ensureProvider:ok");
        }
      } catch (e) {
        console.warn("[AuthContext] provider init during signIn failed", e);
        log.warn("ensureProvider:failed", e);
      }
      await setHasSeenAuth();
      log.debug("setHasSeenAuth:done");
      if (need) {
        setNeedsUsername(true);
        setProvisionalUser(walletUser);
        setProvisionalToken(token); // retaned but not required later
        log.info("signInWithWallet:needsUsername");
      } else {
        // Mark signed in early for downstream UI; defer heavy steps
        setIsFirstTimeUser(false);
        setNeedsUsername(false);
        setProvisionalUser(null);
        setProvisionalToken(null);
        setIsSignedIn(true);
        log.info("signInWithWallet:enrich:start (deferred balances)");
        const enriched = await enrichAndStoreUser(walletUser, {
          refetch: true,
          skipBalances: true,
        });
        // After enrichment (username available), persist local account if possible
        await persistLocalAccountIfPossible(enriched);
        // Kick off balances in background (best-effort)
        try {
          fetchAndStoreBalances(enriched).catch(() => {});
        } catch {}
        log.info("signInWithWallet:enrich:done (balances deferred)");
      }
    } catch (error) {
      console.error("Wallet sign in error:", error);
      log.error("signInWithWallet:error", error);
      throw error;
    } finally {
      setIsLoading(false);
      log.info("signInWithWallet:finish");
    }
  };

  const completeUsername = (finalUser: User) => {
    log.info("completeUsername:start", { userId: finalUser?.id });
    setIsSignedIn(true);
    setIsFirstTimeUser(false);
    setNeedsUsername(false);
    setProvisionalUser(null);
    setProvisionalToken(null);
    enrichAndStoreUser(finalUser, {
      refetch: true,
      skipBalances: true,
    })
      .then(async (u) => {
        await persistLocalAccountIfPossible(u);
        try {
          fetchAndStoreBalances(u).catch(() => {});
        } catch {}
      })
      .catch((e) => {
      console.warn("[AuthContext] enrich after completeUsername failed", e);
      log.warn("completeUsername:enrich:error", e);
      setUser(finalUser); // fallback minimal
      setAuthUser(finalUser).catch(() => {});
    });
  };

  // Central enrichment logic (account info + balances) ---------------------------------
  const enrichAndStoreUser = useCallback(
    async (
      base: User,
      opts?: { refetch?: boolean; cacheBustImages?: boolean; skipBalances?: boolean }
    ): Promise<User> => {
      const t0 = Date.now();
      log.debug("enrich:start", {
        baseId: base?.address,
        refetch: !!opts?.refetch,
        cacheBustImages: !!opts?.cacheBustImages,
        t0,
      });
      const shouldRefetch = !!opts?.refetch;
      let enriched = base;
      try {
        const tFetchStart = Date.now();
        if (shouldRefetch) {
          const key = base.username || base.walletAddress || base.address;
          if (key) {
            const res: any = await getAccount(key);
            const core = res?.data?.result || res?.result || null;
            if (core) enriched = { ...base, ...core } as User;
            log.debug("enrich:getAccount:done", {
              key,
              merged: !!core,
              ms: Date.now() - tFetchStart,
              sinceStart: Date.now() - t0,
            });
          }
        }
      } catch (e) {
        console.warn("[AuthContext] account fetch failed", e);
        log.warn("enrich:getAccount:error", {
          error: e,
          ms: Date.now() - t0,
        });
      }
      // Notifications (unread count) - backend returns only unread for given address
      try {
        const tNotifStart = Date.now();
        const addr = enriched.walletAddress || enriched.address;
        if (addr) {
          const nRes: any = await getNotifications(addr, { unit: 20 });
          const notificationRes = nRes?.data?.result || nRes?.result || nRes;
          if (notificationRes) {
            const unread = (notificationRes as any[]).length;
            enriched = { ...enriched, notificationCount: unread };
            log.debug("enrich:notifications:done", {
              unread,
              ms: Date.now() - tNotifStart,
              sinceStart: Date.now() - t0,
            });
          }
        }
      } catch (e) {
        console.warn("[AuthContext] notifications fetch failed", e);
        log.warn("enrich:notifications:error", {
          error: e,
          sinceStart: Date.now() - t0,
        });
      }
      // Fetch balances (native + selected tokens)
      try {
        if (opts?.skipBalances) {
          log.debug("enrich:balances:skipped", { sinceStart: Date.now() - t0 });
        } else {
          setBalancesLoading(true);
          const tBalancesStart = Date.now();
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
            log.debug("enrich:balances:done", {
              symbols,
              ms: Date.now() - tBalancesStart,
              sinceStart: Date.now() - t0,
            });
          }
        }
      } catch (e) {
        console.warn("[AuthContext] balance fetch failed", e);
        log.warn("enrich:balances:error", {
          error: e,
          sinceStart: Date.now() - t0,
        });
      } finally {
        if (!opts?.skipBalances) setBalancesLoading(false);
      }
      try {
        const tPostStart = Date.now();
        // Derive stakedDHB from balanceData if not already present or outdated
        if (enriched?.balanceData?.length) {
          const derivedStake = maxStacked(enriched.balanceData);
          if (typeof derivedStake === "number") {
            enriched = { ...enriched, stakedDHB: derivedStake };
          }
        }
        // Optionally cache-bust avatar/cover URLs so UI picks up new images after refresh
        if (opts?.cacheBustImages) {
          const bust = (u?: string) =>
            u
              ? u.includes("ts=")
                ? u.replace(/([?&])ts=\d+/, `$1ts=${Date.now()}`)
                : `${u}${u.includes("?") ? "&" : "?"}ts=${Date.now()}`
              : u;
          const next: Partial<User> = {};
          if (enriched.avatarImageUrl)
            next.avatarImageUrl = bust(enriched.avatarImageUrl);
          if (enriched.coverImageUrl)
            next.coverImageUrl = bust(enriched.coverImageUrl);
          enriched = { ...enriched, ...next } as User;
        }
        setUser(enriched);
        await setAuthUser(enriched);
        log.debug("enrich:setAuthUser:done", {
          userId: enriched?.id,
          ms: Date.now() - tPostStart,
          totalMs: Date.now() - t0,
        });
      } catch (e) {
        console.warn("[AuthContext] setAuthUser failed", e);
        log.warn("enrich:setAuthUser:error", {
          error: e,
          totalMs: Date.now() - t0,
        });
      }
      return enriched;
    },
    []
  );

  // Persist imported/local account with username when possible
  const persistLocalAccountIfPossible = useCallback(
    async (enriched: User) => {
      try {
        const address = enriched?.walletAddress || enriched?.address;
        const username = enriched?.username;
        if (!address) return;
        // If the modal already stored this account + private key, just add/refresh the username here.
        const existing = await getLocalAccount(address);
        if (!existing) return; // nothing to enrich yet
        if (username && existing.username !== username) {
          await upsertLocalAccount({ address, username });
        }
      } catch {
        // best-effort; ignore errors
      }
    },
    []
  );

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
    log.debug("requireAuth:called", { isSignedIn, needsUsername });
    if (isSignedIn && !needsUsername) {
      action();
    } else {
      setPendingAction(() => action);
      setShowSignInModal(true);
      log.info("requireAuth:gate:showSignInModal");
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
  // if (provider && !("signer" in (provider as any))) {
  //   // EIP-1193 providers do not expose a signer property; ethers derives it via Web3Provider
  //   console.log(
  //     "[AuthContext] Provider is EIP-1193; .signer not present (expected). Ethers will create a Signer via Web3Provider."
  //   );
  // }

  // Create the context value object
  const authContextValue: AuthContextType = {
    user,
    isLoading,
    isBootLoading,
    balancesLoading,
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
        // Refetch core fields and then enrich/persist
        await enrichAndStoreUser(user, {
          refetch: true,
          cacheBustImages: true,
        });
      } catch (e) {
        console.warn("[AuthContext] refreshUser error", e);
      }
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
