function body(call: any) {
  return JSON.parse(call[1].body);
}

/**
 * The fatal path of the global handler. In a release build the default
 * handler ends the process; the reporter now persists the row and reloads the
 * runtime instead, falling through to the default only when a reload is
 * refused.
 */
describe("error reporter, fatal errors", () => {
  let reporter: typeof import("../../libs/errorReporter");
  let asyncStorage: typeof import("@react-native-async-storage/async-storage").default;
  let handler: (error: unknown, isFatal?: boolean) => void;
  let previous: jest.Mock;
  let reloadAsync: jest.Mock;

  function load() {
    jest.doMock("expo-updates", () => ({ reloadAsync }), { virtual: true });
    (global as any).ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h: typeof handler) => {
        handler = h;
      },
    };
    asyncStorage = require("@react-native-async-storage/async-storage").default;
    reporter = require("../../libs/errorReporter");
    reporter.installGlobalErrorHandler();
  }

  beforeEach(() => {
    jest.resetModules();
    previous = jest.fn();
    reloadAsync = jest.fn().mockResolvedValue(undefined);
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
    (global as any).__DEV__ = false;
    require("../../libs/storage").storage.clearAll();
    load();
  });

  afterEach(() => {
    (global as any).__DEV__ = true;
    delete (global as any).ErrorUtils;
  });

  async function settle() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }

  it("reloads the runtime instead of letting the process die", async () => {
    handler(new Error("undefined is not a function"), true);
    await settle();

    expect(reloadAsync).toHaveBeenCalledTimes(1);
    expect(previous).not.toHaveBeenCalled();
    // The row went to disk before the reload, since memory does not survive it.
    expect(await asyncStorage.getItem("error_reporter_pending_v1")).toContain(
      "undefined is not a function",
    );
  });

  it("falls through to the default handler when a reload is refused", async () => {
    reloadAsync.mockRejectedValue(new Error("no native module"));
    const err = new Error("boom");
    handler(err, true);
    await settle();

    expect(previous).toHaveBeenCalledWith(err, true);
  });

  it("does not restart in development, where the red box is the better tool", async () => {
    (global as any).__DEV__ = true;
    const err = new Error("dev boom");
    handler(err, true);
    await settle();

    expect(reloadAsync).not.toHaveBeenCalled();
    expect(previous).toHaveBeenCalledWith(err, true);
  });

  it("leaves non-fatal errors to the default handler as before", async () => {
    const err = new Error("soft");
    handler(err, false);
    await settle();

    expect(previous).toHaveBeenCalledWith(err, false);
    expect(reloadAsync).not.toHaveBeenCalled();
  });

  it("reports the restart on the next launch", async () => {
    // A launch that follows a reload: the marker is on disk, nothing else is
    // in memory. (The storage mocks are rebuilt by resetModules, so the marker
    // is written directly rather than by running a fatal first.)
    jest.resetModules();
    require("../../libs/crashRecovery").writeCrashMarker({
      reason: "fatal",
      message: "fatal one",
      at: 123,
    });
    load();
    await settle();
    await reporter.flushLogs();

    const rows = (global.fetch as jest.Mock).mock.calls.flatMap((c: any) => body(c).logs);
    const restart = rows.find((r: any) => r.component === "CrashRecovery");
    expect(restart?.message).toContain("restarted after a fatal error");
    expect(JSON.parse(restart.metadata.detail).message).toBe("fatal one");
  });
});
