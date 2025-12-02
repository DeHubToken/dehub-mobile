import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { createAuthAdapter, AuthAdapter } from "../services/auth/authAdapter";
import {
  clearSigningProvider,
  getSigningProvider,
} from "../libs/provider.registry";
import { getAuthMethod } from "../libs/auth.utils";

export type ProviderStatus = "idle" | "initializing" | "ready" | "error";

export type EIP1193Provider = {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  chainConfig?: { chainId?: string | number };
};

type Logger = {
  debug: (...a: any[]) => void;
  info: (...a: any[]) => void;
  warn: (...a: any[]) => void;
  error: (...a: any[]) => void;
};

type UseProviderLifecycleParams = {
  log: Logger;
  getActiveAddress: () => string | undefined;
  onSessionExpired: (trigger: string) => Promise<void>;
  validationThrottleMs?: number;
  reinitBackoffMs?: number;
  healthIntervalMs?: number;
};

type UseProviderLifecycleReturn = {
  provider: EIP1193Provider | null;
  chainId?: number;
  providerStatus: ProviderStatus;
  ensureProvider: () => Promise<void>;
  ensureFreshProvider: () => Promise<void>;
  adoptProvider: (
    prov: EIP1193Provider | null,
    opts?: { setReady?: boolean; mode?: "local" | "override" | "auth" }
  ) => Promise<void>;
  validateAndMaybeReinit: (reason: string) => Promise<void>;
  adoptSigningProviderIfAvailable: () => Promise<boolean>;
  resetProviderState: () => void;
};

export function useProviderLifecycle({
  log,
  getActiveAddress,
  onSessionExpired,
  validationThrottleMs = 15_000,
  reinitBackoffMs = 3_000,
  healthIntervalMs = 120_000,
}: UseProviderLifecycleParams): UseProviderLifecycleReturn {
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>("idle");

  // Consolidated provider meta ref
  const providerMetaRef = useRef({
    isMounted: true,
    providerInitInFlight: null as Promise<void> | null,
    providerValidationInFlight: null as Promise<void> | null,
    lastValidationTs: 0,
    lastReinitTs: 0,
    appState: AppState.currentState as AppStateStatus,
    providerGeneration: 0,
    healthInterval: null as any,
    consecutiveEmptyAccounts: 0,
    listenerCleanup: null as (() => void) | null,
    scheduledValidateTimeout: null as any,
    authAdapter: null as AuthAdapter | null,
    currentMode: undefined as undefined | "local" | "override" | "auth",
  });

  // unmount cleanup
  useEffect(() => {
    return () => {
      providerMetaRef.current.isMounted = false;
      if (providerMetaRef.current.listenerCleanup) {
        try {
          providerMetaRef.current.listenerCleanup();
        } catch {}
      }
      if (providerMetaRef.current.healthInterval)
        clearInterval(providerMetaRef.current.healthInterval);
      if (providerMetaRef.current.scheduledValidateTimeout)
        clearTimeout(providerMetaRef.current.scheduledValidateTimeout);
    };
  }, []);

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

  const fetchAccounts = useCallback(
    async (prov: EIP1193Provider | null): Promise<string[] | null> => {
      if (!prov?.request) return null;
      try {
        const accounts: unknown = await prov.request({
          method: "eth_accounts",
        });
        return Array.isArray(accounts) ? (accounts as string[]) : [];
      } catch (e) {
        log.debug("eth_accounts:failed", e);
        return null;
      }
    },
    [log]
  );

  const attachProviderEventListeners = useCallback(
    (prov: EIP1193Provider | null) => {
      if (!prov) return () => {};
      const onChainChanged = (next: any) => {
        log.debug("chainChanged in provider lifecycle",{next})
        const parsed =
          typeof next === "string" && next.startsWith("0x")
            ? parseInt(next, 16)
            : Number(next);
        if (!Number.isNaN(parsed)) setChainId(parsed);
      };
      const onAccountsChanged = (accs: string[]) => {
        if (!accs || accs.length === 0)
          scheduleValidation("accountsChanged-empty");
      };
      const onDisconnect = (err: any) => {
        log.warn("provider:event:disconnect", err?.message || err);
        scheduleValidation("disconnect");
      };
      try {
        prov.on?.("chainChanged", onChainChanged);
      } catch {}
      try {
        prov.on?.("accountsChanged", onAccountsChanged);
      } catch {}
      try {
        prov.on?.("disconnect", onDisconnect);
      } catch {}
      return () => {
        try {
          prov.removeListener?.("chainChanged", onChainChanged);
        } catch {}
        try {
          prov.removeListener?.("accountsChanged", onAccountsChanged);
        } catch {}
        try {
          prov.removeListener?.("disconnect", onDisconnect);
        } catch {}
      };
    },
    [log]
  );

  const adoptProvider = useCallback(
    async (
      prov: EIP1193Provider | null,
      opts?: { setReady?: boolean; mode?: "local" | "override" | "auth" }
    ) => {
      if (!prov) return;
      try {
        let raw: any;
        if (typeof prov?.request === "function")
          raw = await prov.request({ method: "eth_chainId" });
        if (!raw) raw = prov?.chainConfig?.chainId;
        const parsed = parseChainId(raw);
        if (parsed !== undefined) setChainId(parsed);
      } catch {}
      if (providerMetaRef.current.listenerCleanup) {
        try {
          providerMetaRef.current.listenerCleanup();
        } catch {}
        providerMetaRef.current.listenerCleanup = null;
      }
      const cleanup = attachProviderEventListeners(prov);
      providerMetaRef.current.listenerCleanup = cleanup;
      providerMetaRef.current.currentMode =
        opts?.mode ?? providerMetaRef.current.currentMode ?? "auth";
      setProvider(prov);
      if (opts?.setReady ?? true) setProviderStatus("ready");
    },
    [attachProviderEventListeners, parseChainId]
  );

  // Ensure a local EIP-1193 provider always responds with its account
  const wrapWithAccountsShim = useCallback(
    (prov: EIP1193Provider, address: string): EIP1193Provider => {
      const normalized = address.startsWith("0x") ? address : `0x${address}`;
      return {
        request: async ({
          method,
          params,
        }: {
          method: string;
          params?: any[];
        }) => {
          if (method === "eth_accounts" || method === "eth_requestAccounts") {
            return [normalized.toLowerCase()];
          }
          return prov.request({ method, params });
        },
        on: prov.on?.bind(prov),
        removeListener: prov.removeListener?.bind(prov),
        chainConfig: prov.chainConfig,
      } as EIP1193Provider;
    },
    []
  );

  const internalInitializeProvider = useCallback(async () => {
    setProviderStatus("initializing");
    try {
      if (!providerMetaRef.current.authAdapter)
        providerMetaRef.current.authAdapter = createAuthAdapter();
      const eip1193 = await providerMetaRef.current.authAdapter.getProvider();
      if (!eip1193)
        throw new Error("getWeb3AuthProvider returned null/undefined");
      if (!providerMetaRef.current.isMounted) return;
      log.info("provider:init:adopt");
      let mode: "local" | "override" | "auth" = "auth";
      try {
        const { method } = await getAuthMethod();
        if (method === "local") mode = "local";
      } catch {}
      await adoptProvider(eip1193, { setReady: false, mode });
      providerMetaRef.current.providerGeneration += 1;
      try {
        let rawChainId: any;
        if (typeof eip1193.request === "function")
          rawChainId = await eip1193.request({ method: "eth_chainId" });
        if (!rawChainId) rawChainId = (eip1193 as any)?.chainConfig?.chainId;
        const parsed =
          typeof rawChainId === "string" && rawChainId.startsWith("0x")
            ? parseInt(rawChainId, 16)
            : Number(rawChainId);
        if (!Number.isNaN(parsed)) setChainId(parsed);
      } catch (e) {
        log.warn("provider:init:chainId:error", e);
      }
      const accounts = await fetchAccounts(eip1193);
      if (!accounts || accounts.length === 0)
        scheduleValidation("initial-accounts-empty");
      setProviderStatus("ready");
    } catch (e) {
      log.error("provider:init:error", e);
      setProviderStatus("error");
      throw e;
    }
  }, [adoptProvider, fetchAccounts, getActiveAddress, log]);

  const attemptReinitializeProvider = useCallback(
    async (reason: string) => {
      const now = Date.now();
      if (now - providerMetaRef.current.lastReinitTs < reinitBackoffMs) return;
      providerMetaRef.current.lastReinitTs = now;
      clearSigningProvider(); // <--- add this

      setProvider(null);
      setProviderStatus("idle");
      try {
        await internalInitializeProvider();
      } catch (e) {
        log.warn("reinit:failed", e);
      }
    },
    [internalInitializeProvider, log, reinitBackoffMs]
  );

  const validateAndMaybeReinit = useCallback(
    async (reason: string) => {
      if (providerMetaRef.current.providerValidationInFlight)
        return providerMetaRef.current.providerValidationInFlight;
      const run = (async () => {
        const now = Date.now();
        if (
          now - providerMetaRef.current.lastValidationTs <
          validationThrottleMs
        )
          return;
        providerMetaRef.current.lastValidationTs = now;
        if (!provider || providerStatus !== "ready") return;
        const accounts = await fetchAccounts(provider);
        if (!accounts || accounts.length === 0) {
          log.warn("validate:empty-accounts", { reason });
          providerMetaRef.current.consecutiveEmptyAccounts += 1;
          await attemptReinitializeProvider(reason + "->empty-accounts");
          setTimeout(async () => {
            if (!provider || providerStatus !== "ready") return;
            const postAccounts = await fetchAccounts(provider);
            if (!postAccounts || postAccounts.length === 0) {
              providerMetaRef.current.consecutiveEmptyAccounts += 1;
            } else {
              providerMetaRef.current.consecutiveEmptyAccounts = 0;
            }
            if (providerMetaRef.current.consecutiveEmptyAccounts >= 2) {
              await onSessionExpired(reason);
            }
          }, 1200);
        } else if (providerMetaRef.current.consecutiveEmptyAccounts !== 0) {
          providerMetaRef.current.consecutiveEmptyAccounts = 0;
        }
      })();
      providerMetaRef.current.providerValidationInFlight = run;
      await run.finally(() => {
        providerMetaRef.current.providerValidationInFlight = null;
      });
    },
    [
      attemptReinitializeProvider,
      fetchAccounts,
      log,
      onSessionExpired,
      provider,
      providerStatus,
      validationThrottleMs,
    ]
  );

  // Debounced scheduling to coalesce rapid triggers
  const scheduleValidation = useCallback(
    (reason: string) => {
      if (providerMetaRef.current.scheduledValidateTimeout) return; // debounce
      providerMetaRef.current.scheduledValidateTimeout = setTimeout(() => {
        providerMetaRef.current.scheduledValidateTimeout = null;
        validateAndMaybeReinit(reason).catch(() => {});
      }, 250);
    },
    [validateAndMaybeReinit]
  );

  const ensureProvider = useCallback(async () => {
    if (provider || providerStatus === "ready") return;
    if (providerMetaRef.current.providerInitInFlight)
      return providerMetaRef.current.providerInitInFlight;
    const init = internalInitializeProvider();
    providerMetaRef.current.providerInitInFlight = init;
    await init.finally(() => {
      providerMetaRef.current.providerInitInFlight = null;
    });
  }, [internalInitializeProvider, provider, providerStatus]);

  const ensureFreshProvider = useCallback(async () => {
    if (!provider || providerStatus !== "ready") {
      await ensureProvider();
      return;
    }
    await validateAndMaybeReinit("explicit-ensure-fresh");
  }, [ensureProvider, provider, providerStatus, validateAndMaybeReinit]);

  // AppState resume validation + periodic health
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = providerMetaRef.current.appState;
      providerMetaRef.current.appState = next;
      log.debug("appstate:change", { prev, next });
      if ((prev as string).match(/inactive|background/) && next === "active") {
        log.info("app-resume:skip immediate validation (delayed)");
        setTimeout(() => validateAndMaybeReinit("delayed-app-resume"), 5000);
      }
    });
    return () => sub.remove();
  }, [log, scheduleValidation]);

  useEffect(() => {
    if (providerMetaRef.current.healthInterval)
      clearInterval(providerMetaRef.current.healthInterval);
    providerMetaRef.current.healthInterval = setInterval(() => {
      if (AppState.currentState === "active")
        scheduleValidation("health-interval");
    }, healthIntervalMs);
    return () => {
      if (providerMetaRef.current.healthInterval)
        clearInterval(providerMetaRef.current.healthInterval);
    };
  }, [healthIntervalMs, scheduleValidation]);

  const resetProviderState = useCallback(() => {
    setProvider(null);
    setChainId(undefined);
    setProviderStatus("idle");
  }, []);

  const adoptSigningProviderIfAvailable =
    useCallback(async (): Promise<boolean> => {
      const override = getSigningProvider();
      if (override && typeof (override as any).request === "function") {
        if (provider !== (override as any)) {
          await adoptProvider(override as any, { mode: "override" });
          return true;
        }
      }
      return false;
    }, [adoptProvider, provider]);

  return useMemo(
    () => ({
      provider,
      chainId,
      providerStatus,
      ensureProvider,
      ensureFreshProvider,
      adoptProvider,
      validateAndMaybeReinit,
      adoptSigningProviderIfAvailable,
      resetProviderState,
    }),
    [
      adoptProvider,
      chainId,
      ensureFreshProvider,
      ensureProvider,
      provider,
      providerStatus,
      resetProviderState,
      validateAndMaybeReinit,
    ]
  );
}
