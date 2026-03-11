type StopFn = () => void;

let activePlayer: StopFn | null = null;

export function requestFeedVideoFocus(stop: StopFn): void {
  if (activePlayer && activePlayer !== stop) {
    try { activePlayer(); } catch {}
  }
  activePlayer = stop;
}

export function releaseFeedVideoFocus(stop: StopFn): void {
  if (activePlayer === stop) {
    activePlayer = null;
  }
}

export function revokeAllFeedVideo(): void {
  if (activePlayer) {
    try { activePlayer(); } catch {}
    activePlayer = null;
  }
}
