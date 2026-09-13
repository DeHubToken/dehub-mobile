import { InteractionManager } from "react-native";

/**
 * Run `cb` once the current touch or animation has finished — or straight
 * away when nothing is in flight. Returns a cancel function.
 *
 * InteractionManager is absent under Jest's react-native mock, so it is read
 * defensively; and a screen with a looping animation never reports idle, so
 * the wait is backed by a timer. Same shape as libs/auto-translate-queue.
 */
export function runWhenSettled(cb: () => void, fallbackMs = 1500): () => void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    cb();
  };
  const manager = InteractionManager as typeof InteractionManager | undefined;
  if (manager && typeof manager.runAfterInteractions === "function") {
    const task = manager.runAfterInteractions(once);
    const timer = setTimeout(once, fallbackMs);
    return () => {
      done = true;
      clearTimeout(timer);
      task.cancel();
    };
  }
  const timer = setTimeout(once, 0);
  return () => {
    done = true;
    clearTimeout(timer);
  };
}
