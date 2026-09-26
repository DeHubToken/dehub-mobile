import { useEffect } from "react";
import { getRefreshToken, isTokenExpired } from "../libs/auth.utils";
import { tokenRefreshManager } from "../libs/token-refresh";

type BootDeps<User> = {
  getAuthUser: <T>() => Promise<T | null>;
  getAuthToken: () => Promise<string | null>;
  hasSeenAuth: () => Promise<boolean>;
  setUser: (u: any) => void;
  setIsSignedIn: (v: boolean) => void;
  setIsFirstTimeUser: (v: boolean) => void;
  setIsBootLoading: (v: boolean) => void;
  ensureProvider: () => Promise<void>;
  reconcileProfile?: () => Promise<boolean>;
  /**
   * Refetches the restored profile once it has been verified. The cached copy
   * paints before that, so the caller's own post-boot refetch has to stand
   * down (holdRestoredRefetch) — racing the reconcile below, it would land the
   * old owner profile on top of the corrected one.
   */
  holdRestoredRefetch?: () => void;
  refetchRestoredUser?: (user: User) => Promise<unknown>;
  log:{ warn: (...a: any[]) => void; error: (...a: any[]) => void; info?: (...a: any[]) => void };
};

export function useAuthBoot<User>({
  getAuthUser,
  getAuthToken,
  hasSeenAuth,
  setUser,
  setIsSignedIn,
  setIsFirstTimeUser,
  setIsBootLoading,
  ensureProvider,
  reconcileProfile,
  holdRestoredRefetch,
  refetchRestoredUser,
  log,
}: BootDeps<User>) {
  useEffect(() => {
    // Everything after the cached session is on screen: swapping in the
    // verified social profile, refreshing an expired token, bringing the
    // provider up. None of it holds the splash any more — a returning user
    // sees their app from cache while this runs over the network.
    const settleInBackground = async (userData: User, token: string) => {
      // Replace a cached owner-wallet profile with the verified social profile.
      // That path adopts its own provider, so the rest is skipped.
      try {
        if (await reconcileProfile?.()) return;
      } catch (e) {
        log.warn("boot:reconcileProfile:error", e);
      }

      if (isTokenExpired(token)) {
        log.warn?.("boot:token-expired", "Stored token is expired, attempting refresh");
        const newToken = await tokenRefreshManager.attemptRefresh();
        if (newToken) {
          log.info?.("boot:token-refreshed", "Token refreshed successfully");
        } else if (!(await getRefreshToken())) {
          // attemptRefresh() clears stored credentials only when the backend
          // definitively rejects the refresh token (401/403); with no refresh
          // token left there is no session to keep. Take down the cached one.
          log.warn?.("boot:refresh-rejected", "Refresh token rejected, signing out");
          setUser(null);
          setIsSignedIn(false);
          return;
        } else {
          // A network error, timeout or 5xx: the refresh token in storage is
          // still probably good. Keep the cached session — the API client
          // refreshes again on the first 401 — rather than signing anyone out
          // over a flaky connection.
          log.warn?.("boot:refresh-failed", "Token refresh failed, keeping cached session");
        }
      }

      // Signed out while this was in flight: nothing left to bring up.
      if (!(await getAuthToken())) return;

      ensureProvider().catch((e) => {
        log.warn("boot:ensureProvider:failed", e);
      });
      refetchRestoredUser?.(userData).catch((e) => {
        log.warn("boot:refetchRestoredUser:failed", e);
      });
    };

    const loadAuthState = async () => {
      try {
        const [userData, token, seenAuth] = await Promise.all([
          getAuthUser<User>(),
          getAuthToken(),
          hasSeenAuth(),
        ]);

        if (seenAuth) setIsFirstTimeUser(false);

        if (userData && token) {
          // Render from cache now; verification follows in the background.
          holdRestoredRefetch?.();
          setUser(userData);
          setIsSignedIn(true);
          settleInBackground(userData, token).catch((e) => {
            log.error("boot:settleInBackground:error", e);
          });
        }
      } catch (e) {
        log.error("boot:loadAuthState:error", e);
      } finally {
        setIsBootLoading(false);
      }
    };
    loadAuthState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - all functions are stable refs
}
