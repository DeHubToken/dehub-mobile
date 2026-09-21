/**
 * Guided onboarding — the state behind the "Getting started" checklist (mobile)
 * =============================================================================
 * Native port of web's `use-onboarding-checklist.ts`, against the same two
 * Supabase tables, so somebody who starts the walkthrough on the phone
 * continues it on the web and the friction map sees one trail rather than two.
 *
 * Two rules, both carried over:
 *
 * - **Nothing here may block the interface.** Every write is fire-and-forget
 *   and every failure is swallowed. Somebody on this checklist is somebody who
 *   told us the app is hard; an error toast over a failed analytics insert is
 *   the worst possible confirmation.
 * - **Optimistic locally, durable remotely.** The tick flips in React first and
 *   is persisted after; the row is the truth on the next launch.
 *
 * The row is created only when somebody says yes to the offer, so no row is a
 * real state ("never offered, or declined") rather than an empty one.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "../services/supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { storage } from "../libs/storage";
import { useUser } from "../context/AuthContext";
import {
  ONBOARDING_TOTAL_STEPS,
  countSettledSteps,
  isOnboardingComplete,
  onboardingPercentage,
  type OnboardingAction,
  type OnboardingProgressRow,
  type OnboardingStepId,
  type OnboardingSteps,
} from "../libs/onboarding-steps";

/**
 * Set when the backend says `isNewAccount`, cleared when the offer is answered
 * either way. A sign-up and the first look at the home feed are two different
 * app sessions on mobile — the profile step sits between them — so this has to
 * be durable storage rather than the session flag web can get away with.
 */
export const ONBOARDING_OFFER_KEY = "dehub:onboardingOffer";
const DECLINED_KEY = "dehub:onboardingDeclined";

const EMPTY_STEPS: OnboardingSteps = {};

/** Called from the auth layer the moment a brand-new account is recognised. */
export function markOnboardingOfferPending(): void {
  try {
    storage.set(ONBOARDING_OFFER_KEY, true);
  } catch {
    /* the offer is a nicety; storage being unavailable simply skips it */
  }
}

function offerPending(): boolean {
  try {
    return storage.getBoolean(ONBOARDING_OFFER_KEY) === true;
  } catch {
    return false;
  }
}

function hasDeclined(): boolean {
  try {
    return storage.getBoolean(DECLINED_KEY) === true;
  } catch {
    return false;
  }
}

export interface OnboardingChecklistState {
  progress: OnboardingProgressRow | null;
  loading: boolean;
  steps: OnboardingSteps;
  settled: number;
  total: number;
  percentage: number;
  complete: boolean;
  /** The row exists and has been neither finished nor put away. */
  active: boolean;
  /** No row, a pending offer, and no "no thanks" yet. */
  shouldOffer: boolean;
  start: () => void;
  decline: () => void;
  markDone: (stepId: OnboardingStepId) => void;
  rate: (stepId: OnboardingStepId, rating: "easy" | "hard") => void;
  skip: (stepId: OnboardingStepId) => void;
  dismiss: () => void;
  reopen: () => void;
  recordView: (stepId: OnboardingStepId) => void;
}

function walletOf(user: { walletAddress?: string; address?: string } | null): string | null {
  const raw = user?.walletAddress || user?.address;
  return raw ? raw.toLowerCase() : null;
}

export function useOnboardingChecklist(): OnboardingChecklistState {
  const user = useUser() as { walletAddress?: string; address?: string } | null;
  const address = walletOf(user);

  const [progress, setProgress] = useState<OnboardingProgressRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [declined, setDeclined] = useState<boolean>(() => hasDeclined());
  const [offered, setOffered] = useState<boolean>(() => offerPending());
  const viewed = useRef<Set<string>>(new Set());

  useEffect(() => {
    viewed.current = new Set();
    if (!address) {
      setProgress(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await withWalletHeader(
          supabase
            .from("onboarding_progress" as never)
            .select("wallet_address,started_at,completed_at,dismissed_at,steps")
            .eq("wallet_address", address)
            .maybeSingle(),
          address,
        );
        if (cancelled) return;
        setProgress(((data as unknown) as OnboardingProgressRow | null) || null);
      } catch {
        /* a checklist that cannot load is simply not shown */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const recordEvent = useCallback(
    (stepId: string, action: OnboardingAction, rating?: "easy" | "hard") => {
      if (!address) return;
      try {
        void withWalletHeader(
          supabase.from("onboarding_events" as never).insert({
            wallet_address: address,
            step_id: stepId,
            action,
            rating: rating ?? null,
          } as never),
          address,
        );
      } catch {
        /* one missing row in the friction map is not worth an error on screen */
      }
    },
    [address],
  );

  const persist = useCallback(
    (next: OnboardingProgressRow) => {
      if (!address) return;
      try {
        void withWalletHeader(
          supabase.from("onboarding_progress" as never).upsert(
            {
              wallet_address: address,
              steps: next.steps,
              completed_at: next.completed_at,
              dismissed_at: next.dismissed_at,
            } as never,
            { onConflict: "wallet_address" },
          ),
          address,
        );
      } catch {
        /* kept in memory for this session; the next launch re-reads the row */
      }
    },
    [address],
  );

  const mutateSteps = useCallback(
    (stepId: OnboardingStepId, patch: Partial<OnboardingSteps[string]>) => {
      setProgress((current) => {
        if (!current) return current;
        const steps: OnboardingSteps = {
          ...current.steps,
          [stepId]: { ...(current.steps?.[stepId] || {}), ...patch },
        };
        // The finish stamp is derived: whichever tick happens to be the last
        // one is the one that completes the tour.
        const nowComplete = isOnboardingComplete(steps);
        const next: OnboardingProgressRow = {
          ...current,
          steps,
          completed_at:
            nowComplete && !current.completed_at ? new Date().toISOString() : current.completed_at,
        };
        persist(next);
        if (nowComplete && !current.completed_at) recordEvent("all", "finish");
        return next;
      });
    },
    [persist, recordEvent],
  );

  const clearOffer = useCallback(() => {
    try {
      storage.delete(ONBOARDING_OFFER_KEY);
    } catch {
      /* ignore */
    }
    setOffered(false);
  }, []);

  const start = useCallback(() => {
    if (!address) return;
    setProgress({
      wallet_address: address,
      started_at: new Date().toISOString(),
      completed_at: null,
      dismissed_at: null,
      steps: {},
    });
    clearOffer();
    try {
      storage.delete(DECLINED_KEY);
    } catch {
      /* ignore */
    }
    setDeclined(false);
    try {
      void withWalletHeader(
        supabase.from("onboarding_progress" as never).upsert(
          { wallet_address: address, steps: {}, completed_at: null, dismissed_at: null } as never,
          { onConflict: "wallet_address" },
        ),
        address,
      );
    } catch {
      /* ignore */
    }
    recordEvent("all", "view");
  }, [address, clearOffer, recordEvent]);

  const decline = useCallback(() => {
    try {
      storage.set(DECLINED_KEY, true);
    } catch {
      /* ignore */
    }
    setDeclined(true);
    clearOffer();
    recordEvent("all", "dismiss");
  }, [clearOffer, recordEvent]);

  const markDone = useCallback(
    (stepId: OnboardingStepId) => {
      mutateSteps(stepId, { done: true, skipped: false, at: new Date().toISOString() });
      recordEvent(stepId, "complete");
    },
    [mutateSteps, recordEvent],
  );

  const skip = useCallback(
    (stepId: OnboardingStepId) => {
      mutateSteps(stepId, { skipped: true, at: new Date().toISOString() });
      recordEvent(stepId, "skip");
    },
    [mutateSteps, recordEvent],
  );

  const rate = useCallback(
    (stepId: OnboardingStepId, rating: "easy" | "hard") => {
      mutateSteps(stepId, { rating });
      recordEvent(stepId, "rating", rating);
    },
    [mutateSteps, recordEvent],
  );

  const dismiss = useCallback(() => {
    setProgress((current) => {
      if (!current) return current;
      const next = { ...current, dismissed_at: new Date().toISOString() };
      persist(next);
      return next;
    });
    recordEvent("all", "dismiss");
  }, [persist, recordEvent]);

  const reopen = useCallback(() => {
    setProgress((current) => {
      if (!current) {
        start();
        return current;
      }
      const next = { ...current, dismissed_at: null };
      persist(next);
      return next;
    });
  }, [persist, start]);

  const recordView = useCallback(
    (stepId: OnboardingStepId) => {
      if (viewed.current.has(stepId)) return;
      viewed.current.add(stepId);
      recordEvent(stepId, "view");
    },
    [recordEvent],
  );

  const steps = progress?.steps || EMPTY_STEPS;
  const complete = !!progress?.completed_at || isOnboardingComplete(steps);

  return {
    progress,
    loading,
    steps,
    settled: countSettledSteps(steps),
    total: ONBOARDING_TOTAL_STEPS,
    percentage: onboardingPercentage(steps),
    complete,
    active: !!progress && !progress.dismissed_at,
    shouldOffer: !loading && !!address && !progress && !declined && offered,
    start,
    decline,
    markDone,
    rate,
    skip,
    dismiss,
    reopen,
    recordView,
  };
}
