/**
 * Auto-translate scheduling
 * =========================
 * Auto-translation decorates the feed; it must never compete with loading it.
 *
 * Left unscheduled, every card that mounts fires its own request during the
 * initial render pass, so opening the feed means a dozen-plus translate calls
 * racing the feed query, the avatars and the video for the same connections —
 * which on a phone is most of the reason a screen feels slow to appear.
 *
 * So nothing queued here starts until the interactions in flight have settled,
 * and after that only a few run at a time. Anything the reader asks for by
 * pressing the button skips this entirely and goes out immediately.
 *
 * This is web's queue in `TranslatableText.tsx` ported to React Native, with
 * `InteractionManager.runAfterInteractions` standing in for the browser's
 * `requestIdleCallback`/`window.load` pair.
 *
 * @module libs/auto-translate-queue
 */

import { InteractionManager } from 'react-native';

/** Matches web's AUTO_TRANSLATE_CONCURRENCY. */
const AUTO_TRANSLATE_CONCURRENCY = 3;

type QueuedJob = { run: () => Promise<unknown>; cancelled: boolean };

const queue: QueuedJob[] = [];
let inFlight = 0;
let drainScheduled = false;

function whenIdle(cb: () => void): void {
  // Guarded rather than called directly: InteractionManager is absent under
  // Jest's react-native mock, and a scheduler that throws on import would take
  // the feed down with it. Called as a method, not a detached reference, so a
  // future implementation that leans on `this` keeps working.
  const manager = InteractionManager as typeof InteractionManager | undefined;
  if (manager && typeof manager.runAfterInteractions === 'function') {
    // A screen with a looping animation never reports idle, so back the wait
    // with a timer: translations should still land rather than wait forever.
    let settled = false;
    const once = () => {
      if (settled) return;
      settled = true;
      cb();
    };
    manager.runAfterInteractions(once);
    setTimeout(once, 2000);
    return;
  }
  setTimeout(cb, 200);
}

function drain(): void {
  if (drainScheduled) return;
  if (inFlight >= AUTO_TRANSLATE_CONCURRENCY || queue.length === 0) return;

  drainScheduled = true;
  whenIdle(() => {
    drainScheduled = false;
    while (inFlight < AUTO_TRANSLATE_CONCURRENCY) {
      const job = queue.shift();
      if (!job) break;
      // Cards scroll out of an infinite feed faster than a queue drains; a job
      // whose component is gone should cost nothing.
      if (job.cancelled) continue;
      inFlight++;
      job
        .run()
        .catch(() => {})
        .then(() => {
          inFlight--;
          drain();
        });
    }
    if (queue.length > 0) drain();
  });
}

/**
 * Queue an auto-translation.
 *
 * @returns a cancel function to call on unmount.
 */
export function queueAutoTranslate(run: () => Promise<unknown>): () => void {
  const job: QueuedJob = { run, cancelled: false };
  queue.push(job);
  drain();
  return () => {
    job.cancelled = true;
  };
}

/** Test seam: drop anything still waiting. */
export function __resetAutoTranslateQueue(): void {
  queue.length = 0;
  inFlight = 0;
  drainScheduled = false;
}
