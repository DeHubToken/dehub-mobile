/**
 * Kids Mode — mirrors web's `src/hooks/use-kids-mode.ts`.
 *
 * One switch with two halves that have to stay in step: a flag on the account,
 * which the API filters on and a client cannot strip, and a lock on this
 * device, which puts `X-Kids-Mode` on every request and is the only thing there
 * is when nobody is signed in.
 *
 * The device lock is written only after the server has agreed. Arming it
 * optimistically would leave a device filtered while the account was not, and
 * on the way out a failed PIN check would unlock the device.
 *
 * The UI renders from the LOCK, not from the account — the lock is synchronous
 * and correct on the first frame, and a Kids Mode session must never show the
 * adult navigation while a request is in flight.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { useUser } from '../context/AuthContext';
import { KidsModeService } from '../services/kids-mode.service';
import {
  isKidsModeLocked,
  kidsModeReady,
  onKidsModeChange,
  setKidsModeLocked,
} from '../libs/kids-mode-lock';
import {
  clearPendingKidsPin,
  getPendingKidsPin,
  hasPendingKidsPin,
  onboardingChoicesReady,
} from '../libs/onboarding-choices';

export function useKidsMode() {
  const { t: _copy } = _useCopy();
  const user = useUser() as any;
  const [locked, setLocked] = useState<boolean>(() => isKidsModeLocked());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onKidsModeChange(setLocked);
    // The lock is read from AsyncStorage at module scope and may still have
    // been in flight when this mounted, so take the settled value as well as
    // subscribing — otherwise a screen mounted during boot renders unlocked and
    // never hears about it, because nothing "changed" after it subscribed.
    void kidsModeReady.then(setLocked);
    return unsubscribe;
  }, []);

  // Reconcile a device whose lock disagrees with the account it is signed into
  // — Kids Mode armed from the website, or turned off somewhere else. The
  // account wins in both directions; it is the half a client cannot fake.
  const accountEnabled = user?.kidsMode?.enabled === true;
  // Except while a Kids Mode picked on the first-run setup is still on its way
  // to the account (OnboardingChoicesApplier): the device was locked before
  // there was an account to flag, and unlocking it here would drop a child
  // out of Kids Mode the moment a grown-up signed in.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void onboardingChoicesReady.then(() => {
      if (cancelled || hasPendingKidsPin()) return;
      if (accountEnabled !== isKidsModeLocked()) {
        void setKidsModeLocked(accountEnabled);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, accountEnabled]);

  const enable = useCallback(async (pin: string) => {
    setSaving(true);
    try {
      await KidsModeService.enable(pin);
      await setKidsModeLocked(true);
    } finally {
      setSaving(false);
    }
  }, []);

  const disable = useCallback(async (pin: string) => {
    // A guest who picked Kids on the first-run setup has no account to ask, so
    // the PIN they set there is the one that lets them out.
    if (!user && hasPendingKidsPin()) {
      if (pin !== getPendingKidsPin()) throw new Error(_copy("copy.8209668bd0c1", { defaultValue: "That PIN is not right." }));
      await clearPendingKidsPin();
      await setKidsModeLocked(false);
      return;
    }
    setSaving(true);
    try {
      await KidsModeService.disable(pin);
      await setKidsModeLocked(false);
    } finally {
      setSaving(false);
    }
  }, [user, _copy]);

  return { isKidsMode: locked, enable, disable, saving };
}
