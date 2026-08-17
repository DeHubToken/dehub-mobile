import { queueAutoTranslate, __resetAutoTranslateQueue } from '../../libs/auto-translate-queue';

// The react-native mock in __mocks__/setup.ts has no InteractionManager, so the
// queue takes its setTimeout fallback — which is the branch worth pinning
// anyway: it is what runs if a future RN version drops or renames the API.
const IDLE_MS = 200;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('libs/auto-translate-queue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetAutoTranslateQueue();
  });
  afterEach(() => jest.useRealTimers());

  it('does not run a job during the render pass that queued it', () => {
    const run = jest.fn().mockResolvedValue(undefined);
    queueAutoTranslate(run);

    // The whole point: a card that mounts must not fire its request while the
    // feed is still painting.
    expect(run).not.toHaveBeenCalled();

    jest.advanceTimersByTime(IDLE_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs at most three jobs at a time', async () => {
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const runs = gates.map((g) => jest.fn(() => g.promise));
    runs.forEach((r) => queueAutoTranslate(r));

    jest.advanceTimersByTime(IDLE_MS);

    expect(runs[0]).toHaveBeenCalled();
    expect(runs[1]).toHaveBeenCalled();
    expect(runs[2]).toHaveBeenCalled();
    expect(runs[3]).not.toHaveBeenCalled();

    // The fourth only starts once a slot frees up.
    gates[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(IDLE_MS);

    expect(runs[3]).toHaveBeenCalled();
  });

  it('skips a job cancelled before it ran', () => {
    const first = jest.fn().mockResolvedValue(undefined);
    const cancelled = jest.fn().mockResolvedValue(undefined);

    queueAutoTranslate(first);
    const cancel = queueAutoTranslate(cancelled);
    // A card scrolled out of the FlatList window before the queue reached it.
    cancel();

    jest.advanceTimersByTime(IDLE_MS);

    expect(first).toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('keeps draining after a job rejects', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('translate-text 500'));
    const later = jest.fn().mockResolvedValue(undefined);

    for (let i = 0; i < 3; i++) queueAutoTranslate(failing);
    queueAutoTranslate(later);

    jest.advanceTimersByTime(IDLE_MS);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(IDLE_MS);

    expect(later).toHaveBeenCalled();
  });
});
