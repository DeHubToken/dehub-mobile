/**
 * Launch reveal waits for the first screen to have something to show.
 *
 * The preloader used to lift as soon as the navigator mounted, so the logo
 * animation played over a feed that was still fetching: skeletons, then posts
 * popping in under the moving mark. Home now claims the launch while it is the
 * focused screen and releases it once its first feed page is in. Any other
 * first screen claims nothing and reveals at once, and the boot gate caps the
 * wait (FIRST_SCREEN_MAX_WAIT_MS) so a slow network still opens the app.
 */
// Short on purpose: a saved feed releases at once, so this cap only decides
// how long slow connections stare at the logo. Posts fill in after it lands.
export const FIRST_SCREEN_MAX_WAIT_MS = 800;

let claimed = false;
let ready = false;
let done = false;
const listeners = new Set<() => void>();

function flush() {
  listeners.forEach(listener => listener());
  listeners.clear();
}

/** The focused first screen holds the reveal until it calls the release. */
export function claimFirstScreen(): () => void {
  if (done) return () => {};
  claimed = true;
  return () => {
    if (ready) return;
    ready = true;
    flush();
  };
}

/** Resolves when the claimed screen is ready, at once when nothing claimed, or after maxMs. */
export function whenFirstScreenReady(maxMs = FIRST_SCREEN_MAX_WAIT_MS): Promise<void> {
  if (done || !claimed || ready) {
    done = true;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      listeners.delete(finish);
      done = true;
      resolve();
    };
    const timer = setTimeout(finish, maxMs);
    listeners.add(finish);
  });
}

export function __resetFirstScreenForTests(): void {
  claimed = false;
  ready = false;
  done = false;
  listeners.clear();
}
