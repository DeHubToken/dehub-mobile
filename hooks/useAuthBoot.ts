import { useEffect } from "react";
import { isTokenExpired } from "../libs/auth.utils";
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
  log: { warn: (...a: any[]) => void; error: (...a: any[]) => void; info?: (...a: any[]) => void };
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
  log,
}: BootDeps<User>) {
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const [userData, token, seenAuth] = await Promise.all([
          getAuthUser<User>(),
          getAuthToken(),
          hasSeenAuth(),
        ]);
        
        if (userData && token) {
          // Validate token expiration before restoring session
          if (isTokenExpired(token)) {
            log.warn?.("boot:token-expired", "Stored token is expired, attempting refresh");
            // Try to refresh the token before giving up
            const newToken = await tokenRefreshManager.attemptRefresh();
            if (newToken) {
              log.info?.("boot:token-refreshed", "Token refreshed successfully");
              setUser(userData);
              setIsSignedIn(true);
              ensureProvider().catch((e) => {
                log.warn("boot:ensureProvider:failed", e);
              });
            } else {
              // tokenRefreshManager.attemptRefresh() already cleared stored
              // credentials if (and only if) the backend definitively
              // rejected the refresh token. If it didn't -- a network error
              // or a 5xx -- the refresh token in storage is still probably
              // good, so don't destroy it here just because this one boot
              // couldn't confirm it. The user sits signed-out for this
              // session and gets a real retry next launch instead of a
              // forced full re-login over a flaky connection.
              log.warn?.("boot:refresh-failed", "Token refresh failed, staying signed out for this session");
            }
          } else {
            // Token is valid, restore session
            setUser(userData);
            setIsSignedIn(true);
            ensureProvider().catch((e) => {
              log.warn("boot:ensureProvider:failed", e);
            });
          }
        }
        
        if (seenAuth) setIsFirstTimeUser(false);
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
