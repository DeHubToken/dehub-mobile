import { createContext, useContext, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";

export function createVisualActivity() {
  let foreground = true;
  let focused = true;
  let callBusy = false;
  let callCovered = false;
  let settled = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const settle = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    settled = false;
    notify();
    if (foreground && focused) {
      timer = setTimeout(() => { timer = null; settled = true; notify(); }, 250);
    }
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    isVisualActive: () => foreground && focused && settled && !callCovered,
    isForeground: () => foreground && focused,
    isCallBusy: () => callBusy,
    // Native sheets move Android window focus without hiding their owning feed.
    isFeedSurfaceActive: () => foreground && !callBusy,
    isFeedPlaybackAllowed: () => foreground && focused && settled && !callBusy,
    setForeground: (next: boolean) => { if (foreground !== next) { foreground = next; settle(); } },
    setFocused: (next: boolean) => { if (focused !== next) { focused = next; settle(); } },
    setCall: (busy: boolean, covered: boolean) => {
      if (callBusy === busy && callCovered === covered) return;
      callBusy = busy;
      callCovered = covered;
      settle();
    },
    dispose: () => { if (timer) clearTimeout(timer); timer = null; listeners.clear(); },
  };
}

export const visualActivity = createVisualActivity();
export const FeedPlaybackActiveContext = createContext(true);
export const useFeedPlaybackAllowed = () => {
  const surfaceActive = useContext(FeedPlaybackActiveContext);
  const appActive = useSyncExternalStore(visualActivity.subscribe, visualActivity.isFeedPlaybackAllowed, () => true);
  return surfaceActive && appActive;
};
export const useFeedSurfaceActive = () => {
  const surfaceActive = useContext(FeedPlaybackActiveContext);
  const appActive = useSyncExternalStore(visualActivity.subscribe, visualActivity.isFeedSurfaceActive, () => true);
  return surfaceActive && appActive;
};
export const useCallInProgress = () =>
  useSyncExternalStore(visualActivity.subscribe, visualActivity.isCallBusy, () => false);
export const useVisualActivity = () =>
  useSyncExternalStore(visualActivity.subscribe, visualActivity.isVisualActive, () => true);

export function trackVisualActivity(): () => void {
  visualActivity.setForeground(AppState.currentState === "active");
  const change = AppState.addEventListener("change", state => {
    // Background activities can return without a matching focus event.
    if (state === "active") visualActivity.setFocused(true);
    visualActivity.setForeground(state === "active");
  });
  const blur = Platform.OS === "android" ? AppState.addEventListener("blur", () => visualActivity.setFocused(false)) : null;
  const focus = Platform.OS === "android" ? AppState.addEventListener("focus", () => visualActivity.setFocused(true)) : null;
  return () => { change.remove(); blur?.remove(); focus?.remove(); };
}

