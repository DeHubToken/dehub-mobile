import { useEffect, useRef } from 'react';
import { useAuthActions, useAuthState, useUser } from '../context/AuthContext';
import { AuthService } from '../services/auth.service';
import { createLogger } from '../libs/logger';
import {
  adoptAccountFeedDefaults,
  feedDefaultsCustoms,
  feedDefaultsEvents,
} from '../libs/feed-defaults';

const logger = createLogger('FeedDefaults');
const SAVE_DELAY_MS = 1500;

/**
 * Carries the default feed tab and saved feed toggles (libs/feed-defaults)
 * between this device and the account, the way web's FeedDefaultsSync does.
 * Mounted once by HomeScreen, which is always on the stack.
 *
 * `onAdopted` runs when the account's values replaced this device's, so Home
 * can pick them up if the viewer has not changed anything yet.
 */
export function useFeedDefaultsSync(onAdopted: () => void) {
  const user = useUser();
  const { isSignedIn } = useAuthState();
  const { patchUser } = useAuthActions();
  const customs = (user as { customs?: Record<string, string> } | null)?.customs;
  const customsRef = useRef(customs);
  customsRef.current = customs;
  const onAdoptedRef = useRef(onAdopted);
  onAdoptedRef.current = onAdopted;
  const adoptedFor = useRef<string | null>(null);
  const userKey = (user as { address?: string; _id?: string } | null)?.address
    ?? (user as { _id?: string } | null)?._id
    ?? null;

  // Account in: once per signed-in account.
  useEffect(() => {
    if (!isSignedIn || !userKey) { adoptedFor.current = null; return; }
    if (adoptedFor.current === userKey || !user) return;
    adoptedFor.current = userKey;
    const { hasTab, hasToggles, changed } = adoptAccountFeedDefaults(customsRef.current);
    if (changed) onAdoptedRef.current();
    // Set on this device before the account had any: send them up.
    if (!hasTab || !hasToggles) feedDefaultsEvents.emit();
  }, [isSignedIn, userKey, user]);

  // Changes out: debounced, merged over the latest customs.
  useEffect(() => {
    if (!isSignedIn) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = async () => {
      timer = null;
      const existing = { ...(customsRef.current ?? {}) };
      const next = feedDefaultsCustoms();
      if (Object.entries(next).every(([k, v]) => existing[k] === v)) return;
      const merged = { ...existing, ...next };
      try {
        await AuthService.updateProfile({ customs: JSON.stringify(merged) });
        customsRef.current = merged;
        patchUser({ customs: merged } as any).catch(() => {});
      } catch (error) {
        logger.warn('Saving feed defaults failed', error);
      }
    };
    const unsubscribe = feedDefaultsEvents.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, SAVE_DELAY_MS);
    });
    return () => {
      unsubscribe();
      if (timer) { clearTimeout(timer); void save(); }
    };
  }, [isSignedIn, patchUser]);
}
