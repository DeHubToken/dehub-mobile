/**
 * Hands the first-run audience choice to the account once there is one.
 *
 * The setup asks Kids / Everyone / Mature 18+ before sign-in, when there is no
 * account to save it on (libs/onboarding-choices). The first time a signed-in
 * user is present, this turns Kids Mode on with the PIN they set, or turns
 * mature content on, and forgets the pending choice. A failed request keeps it
 * pending and is tried again on the next launch; until then the device lock
 * keeps Kids Mode in force.
 */
import { useEffect, useRef } from 'react';
import { useAuthActions, useAuthState, useUser } from '../../context/AuthContext';
import { KidsModeService } from '../../services/kids-mode.service';
import { AuthService } from '../../services/auth.service';
import { MATURE_CONTENT_ENABLED } from '../../config/storefront';
import { setKidsModeLocked } from '../../libs/kids-mode-lock';
import {
  clearPendingKidsPin,
  getPendingKidsPin,
  hasPendingMature,
  onboardingChoicesReady,
  setPendingMature,
} from '../../libs/onboarding-choices';
import { createLogger } from '../../libs/logger';

const log = createLogger('OnboardingChoicesApplier');

export default function OnboardingChoicesApplier(): null {
  const user = useUser() as any;
  const { isSignedIn, needsUsername } = useAuthState();
  const { patchUser } = useAuthActions() as any;
  const appliedFor = useRef<string | null>(null);
  const account = isSignedIn && !needsUsername && user ? String(user.walletAddress ?? user.id ?? '') : null;

  useEffect(() => {
    if (!account || appliedFor.current === account) return;
    appliedFor.current = account;
    void (async () => {
      await onboardingChoicesReady;

      const pin = getPendingKidsPin();
      if (pin) {
        try {
          if (user?.kidsMode?.enabled !== true) await KidsModeService.enable(pin);
          await patchUser({ kidsMode: { ...(user?.kidsMode ?? {}), enabled: true } });
          await setKidsModeLocked(true);
          await clearPendingKidsPin();
        } catch (error) {
          log.warn('Kids Mode from setup not saved yet', error);
        }
      }

      if (hasPendingMature()) {
        try {
          if (MATURE_CONTENT_ENABLED && user?.showMatureContent !== true) {
            await patchUser({ showMatureContent: true });
            await AuthService.updateProfile({ showMatureContent: true });
          }
          await setPendingMature(false);
        } catch (error) {
          log.warn('Mature content from setup not saved yet', error);
        }
      }
    })();
  }, [account, user, patchUser]);

  return null;
}
