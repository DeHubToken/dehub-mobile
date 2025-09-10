let activeStopper: (() => void) | null = null;
let navigationGuardsAttached = false;

export function registerActivePreview(stopper: () => void) {
  // stop the old preview first
  if (activeStopper && activeStopper !== stopper) {
    activeStopper();
  }
  activeStopper = stopper;
}

export function clearActivePreview(stopper: () => void) {
  if (activeStopper === stopper) {
    activeStopper = null;
  }
}

export function stopActivePreview() {
  if (activeStopper) {
    activeStopper();
    activeStopper = null;
  }
}

// Attach once to a navigation object to ensure previews stop on any navigation transition
export function ensurePreviewNavigationGuards(navigation: any) {
  if (!navigation || navigationGuardsAttached) return;
  navigationGuardsAttached = true;
  const stop = () => {
    stopActivePreview();
  };
  try {
    navigation.addListener?.("blur", stop);
    navigation.addListener?.("beforeRemove", stop);
    navigation.addListener?.("state", () => {
      if (!navigation.isFocused?.()) stop();
    });
    navigation.addListener?.("transitionStart", stop);
  } catch {
    // ignore
  }
}
