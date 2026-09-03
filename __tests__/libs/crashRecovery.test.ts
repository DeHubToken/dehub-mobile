describe("crash recovery", () => {
  let recovery: typeof import("../../libs/crashRecovery");
  let storage: typeof import("../../libs/storage").storage;
  let reloadAsync: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    reloadAsync = jest.fn().mockResolvedValue(undefined);
    jest.doMock("expo-updates", () => ({ reloadAsync }), { virtual: true });
    storage = require("../../libs/storage").storage;
    storage.clearAll();
    recovery = require("../../libs/crashRecovery");
    (global as any).__DEV__ = false;
  });

  afterEach(() => {
    (global as any).__DEV__ = true;
  });

  it("throws the persisted query cache away", () => {
    storage.set(recovery.QUERY_CACHE_KEY, '{"poisoned":true}');
    recovery.dropPersistedQueryCache();
    expect(storage.getString(recovery.QUERY_CACHE_KEY)).toBeUndefined();
  });

  it("allows a handful of automatic restarts, then refuses", () => {
    const now = 1_000_000;
    for (let i = 0; i < recovery.MAX_RESTARTS_IN_WINDOW; i++) {
      expect(recovery.claimRestart(now + i)).toBe(true);
    }
    expect(recovery.claimRestart(now + 10)).toBe(false);
    expect(recovery.restartsInWindow(now + 10)).toBe(recovery.MAX_RESTARTS_IN_WINDOW);
    // Once the window has passed, the budget is back.
    expect(recovery.claimRestart(now + recovery.RESTART_WINDOW_MS + 1)).toBe(true);
  });

  it("reloads the runtime, drops the cache and leaves a marker for the next launch", async () => {
    storage.set(recovery.QUERY_CACHE_KEY, "{}");
    const ok = await recovery.restartApp("fatal", "undefined is not a function");
    expect(ok).toBe(true);
    expect(reloadAsync).toHaveBeenCalledTimes(1);
    expect(storage.getString(recovery.QUERY_CACHE_KEY)).toBeUndefined();

    const marker = recovery.takeCrashMarker();
    expect(marker?.reason).toBe("fatal");
    expect(marker?.message).toBe("undefined is not a function");
    // Taken once: the second read is empty.
    expect(recovery.takeCrashMarker()).toBeNull();
  });

  it("does not restart automatically in development", async () => {
    (global as any).__DEV__ = true;
    expect(await recovery.restartApp("fatal")).toBe(false);
    expect(reloadAsync).not.toHaveBeenCalled();
  });

  it("stops restarting once the budget is spent, so a persistent fault cannot loop", async () => {
    for (let i = 0; i < recovery.MAX_RESTARTS_IN_WINDOW; i++) {
      expect(await recovery.restartApp("fatal")).toBe(true);
    }
    expect(await recovery.restartApp("fatal")).toBe(false);
    expect(reloadAsync).toHaveBeenCalledTimes(recovery.MAX_RESTARTS_IN_WINDOW);
  });

  it("lets a person restart as often as they like", async () => {
    for (let i = 0; i < recovery.MAX_RESTARTS_IN_WINDOW + 2; i++) {
      expect(await recovery.restartApp("user", "", { userInitiated: true })).toBe(true);
    }
  });

  it("reports false rather than throwing when the runtime cannot reload", async () => {
    reloadAsync.mockRejectedValue(new Error("no native module"));
    expect(await recovery.restartApp("fatal")).toBe(false);
  });
});
