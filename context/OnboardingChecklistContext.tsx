/**
 * One onboarding checklist per app session (mobile)
 * =================================================
 * The "Getting started" state is read in two places — the home card with its
 * sheet, and the settings row that reopens it. Each calling the hook would
 * mean two loads of the same row and two copies of the optimistic state that
 * drift the moment one of them ticks a step.
 *
 * `useOnboarding()` returns null outside the provider rather than throwing:
 * everything reading this is an optional ornament, and a screen rendered
 * somewhere unusual should go without the card, not crash.
 */
import React, { createContext, useContext } from "react";

import {
  useOnboardingChecklist,
  type OnboardingChecklistState,
} from "../hooks/useOnboardingChecklist";

const OnboardingChecklistContext = createContext<OnboardingChecklistState | null>(null);

export const OnboardingChecklistProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const value = useOnboardingChecklist();
  return (
    <OnboardingChecklistContext.Provider value={value}>
      {children}
    </OnboardingChecklistContext.Provider>
  );
};

export function useOnboarding(): OnboardingChecklistState | null {
  return useContext(OnboardingChecklistContext);
}
