export type PlaybackPhase = 'idle' | 'loading' | 'playing' | 'retrying' | 'failed' | 'blocked';
type Options = {
  allowed: () => boolean;
  play: (reload: boolean, stillAllowed: () => boolean) => void | Promise<void>;
  pause: () => void;
  changed: (phase: PlaybackPhase) => void;
  report: (event: string, detail: Record<string, unknown>) => void;
  timeoutMs?: number;
};

/** One reload per play intent. Leaving, pausing or changing source invalidates it. */
export function createPlaybackRecovery(options: Options) {
  let phase: PlaybackPhase = 'idle';
  let wanted = false;
  let generation = 0;
  let retries = 0;
  let startedAt = 0;
  let replacing = false;
  let recoveryReported = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const allowed = () => wanted && options.allowed();
  const change = (next: PlaybackPhase) => {
    if (phase === next) return;
    phase = next;
    options.changed(next);
  };
  const report = (event: string, reason?: string) => options.report(event, {
    reason, retries, elapsedMs: Date.now() - startedAt,
  });
  const stop = () => {
    wanted = false;
    generation++;
    replacing = false;
    clear();
    change('idle');
  };
  const arm = () => {
    if (timer || !allowed()) return;
    timer = setTimeout(() => {
      timer = undefined;
      fail('timeout');
    }, options.timeoutMs ?? 10_000);
  };
  const attempt = (reload: boolean) => {
    const ticket = ++generation;
    replacing = reload;
    const current = () => ticket === generation && allowed();
    arm();
    try {
      Promise.resolve(options.play(reload, current)).then(() => {
        if (ticket === generation) replacing = false;
      }, error => {
        if (!current()) return;
        replacing = false;
        // Browser autoplay policy requires a tap, not another network request.
        if (error?.name === 'NotAllowedError') {
          clear();
          wanted = false;
          change('blocked');
          return;
        }
        fail(error?.name || 'play-rejected');
      });
    } catch {
      replacing = false;
      fail('play-threw');
    }
  };
  const fail = (reason = 'source-error') => {
    if (!allowed()) { if (wanted) stop(); return; }
    // replace/load can emit the old item's error again while detaching it.
    if (replacing && reason !== 'timeout') return;
    clear();
    if (retries === 0) {
      retries++;
      report('retry', reason);
      change('retrying');
      attempt(true);
    } else {
      report('failed', reason);
      wanted = false;
      generation++;
      replacing = false;
      change('failed');
      options.pause();
    }
  };
  const watch = () => {
    if (wanted || !options.allowed()) return;
    wanted = true;
    retries = 0;
    recoveryReported = false;
    startedAt = Date.now();
    change('loading');
    arm();
  };
  return {
    start() {
      if (!options.allowed()) return;
      const fresh = !wanted;
      const reload = phase === 'failed';
      watch();
      // Readiness may repeat the original play intent, but must not start a
      // second replacement or reset the retry budget.
      if (fresh || !replacing) attempt(reload);
    },
    watch,
    stop,
    fail,
    waiting() {
      if (!allowed()) return;
      if (phase === 'playing') change('loading');
      arm();
    },
    progress() {
      if (!allowed()) return;
      clear();
      if (retries && !recoveryReported) { recoveryReported = true; report('recovered'); }
      change('playing');
    },
    get phase() { return phase; },
    get wanted() { return wanted; },
    get replacing() { return replacing; },
  };
}

/** Never include query strings, signed URLs, or arbitrary error messages. */
export function playbackSourceIdentity(source: string): string {
  return source.replace(/[?#].*$/, '').replace(/\/\/[^/@]+@/, '//').slice(0, 240);
}
