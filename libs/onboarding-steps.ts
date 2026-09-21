/**
 * Guided onboarding — the steps, and the arithmetic over them (mobile)
 * ====================================================================
 * Native port of web's `src/lib/onboarding-steps.ts`. Same seven ids, same
 * order, same maths — the ids are written to `onboarding_events.step_id` and
 * read by one shared admin friction map, so web and the app have to agree on
 * them or the same step appears twice in the funnel.
 *
 * What differs is only the destination: a route string on web, a ScreenNames
 * entry here.
 */
import { ScreenNames } from "../navigation/ScreenNames";

/** A step's outcome as stored in `onboarding_progress.steps`. */
export interface OnboardingStepState {
  done?: boolean;
  at?: string | null;
  rating?: "easy" | "hard" | null;
  skipped?: boolean;
}

export type OnboardingSteps = Record<string, OnboardingStepState>;

export interface OnboardingProgressRow {
  wallet_address: string;
  started_at: string;
  completed_at: string | null;
  dismissed_at: string | null;
  steps: OnboardingSteps;
}

/** What an event row can say. Mirrors the CHECK constraint on the table. */
export type OnboardingAction = "view" | "complete" | "skip" | "rating" | "dismiss" | "finish";

export type OnboardingStepId =
  | "profile"
  | "wallet"
  | "feed"
  | "first-post"
  | "follow"
  | "comment"
  | "rewards";

export interface OnboardingStepDef {
  id: OnboardingStepId;
  /** Where the "Take me there" button goes. Every name is mounted. */
  screen: ScreenNames;
  /** Lucide icon name, resolved by the component so this file stays data. */
  icon: "UserRound" | "Wallet" | "Sparkles" | "PenLine" | "Users" | "MessageCircle" | "Trophy";
}

export const ONBOARDING_STEPS: readonly OnboardingStepDef[] = [
  { id: "profile", screen: ScreenNames.EditProfile, icon: "UserRound" },
  { id: "wallet", screen: ScreenNames.CommandCentre, icon: "Wallet" },
  { id: "feed", screen: ScreenNames.Prompt, icon: "Sparkles" },
  { id: "first-post", screen: ScreenNames.Upload, icon: "PenLine" },
  { id: "follow", screen: ScreenNames.Explore, icon: "Users" },
  // Commenting happens inside a post card on the feed, so the honest
  // destination is the feed itself rather than a screen that does not exist.
  { id: "comment", screen: ScreenNames.Home, icon: "MessageCircle" },
  { id: "rewards", screen: ScreenNames.SuperPowers, icon: "Trophy" },
] as const;

export const ONBOARDING_TOTAL_STEPS = ONBOARDING_STEPS.length;

/**
 * How many steps are behind you. A skipped step counts: the checklist is a
 * tour, not a quest, and refusing one step should not leave somebody stuck on
 * "6 of 7" forever.
 */
export function countSettledSteps(steps: OnboardingSteps | null | undefined): number {
  if (!steps) return 0;
  return ONBOARDING_STEPS.reduce((total, step) => {
    const state = steps[step.id];
    return total + (state?.done || state?.skipped ? 1 : 0);
  }, 0);
}

/** Whole-number percentage, clamped to 0–100, for the progress bar. */
export function onboardingPercentage(steps: OnboardingSteps | null | undefined): number {
  if (ONBOARDING_TOTAL_STEPS === 0) return 100;
  const settled = countSettledSteps(steps);
  return Math.max(0, Math.min(100, Math.round((settled / ONBOARDING_TOTAL_STEPS) * 100)));
}

/** True once every step has been done or skipped. */
export function isOnboardingComplete(steps: OnboardingSteps | null | undefined): boolean {
  return countSettledSteps(steps) >= ONBOARDING_TOTAL_STEPS;
}

/** The first unsettled step, or null when the tour is over. */
export function nextOnboardingStep(
  steps: OnboardingSteps | null | undefined,
): OnboardingStepDef | null {
  return (
    ONBOARDING_STEPS.find((step) => {
      const state = steps?.[step.id];
      return !state?.done && !state?.skipped;
    }) || null
  );
}
